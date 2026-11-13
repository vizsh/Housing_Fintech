"""Train the valuation engine, calibrate its uncertainty, and benchmark it.

Pipeline
  1. Time-align every source to the valuation date (assumed appreciation), target = log Rs/sqft.
  2. Out-of-fold comparable-sales features; 15% of training rows get "cold-start" copies whose comps
     come only from other cities, so the model learns to lean on satellite + OSM where data is thin.
  3. LightGBM point model (monotone in neighbour price level) + LightGBM scale model on |OOF residual|.
  4. Normalised, Mondrian (by comp density) split-conformal calibration -> intervals with coverage
     guarantees, FSD and confidence score.
  5. Benchmarks vs portal-style baselines on three splits: random, unseen locality, unseen city.
"""
from __future__ import annotations

import json
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold, KFold

import features as F
from common import ART, ASSUMPTIONS, PROC, SOURCE_YEAR, valuation_year

RNG = np.random.default_rng(7)
HOLDOUT_CITIES = ["lucknow", "coimbatore", "nagpur", "indore", "bhubaneswar", "dehradun", "raipur", "vijayawada"]
LEVELS = {"p68": 0.68, "p80": 0.80, "p90": 0.90}
PARAMS = dict(objective="huber", alpha=0.35, learning_rate=0.03, num_leaves=127, min_data_in_leaf=25,
              feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=3.0, verbose=-1,
              cat_smooth=20, max_cat_to_onehot=8)
ROUNDS = 2200


def load():
    df = pd.read_parquet(PROC / "listings.parquet")
    ae = pd.read_parquet(PROC / "aef_points.parquet")
    df["_k"] = list(zip(df.lat.round(4), df.lon.round(4)))
    ae["_k"] = list(zip(ae.lat, ae.lon))
    ae_cols = [c for c in ae.columns if c.startswith("ae")]
    df = df.merge(ae[["_k"] + ae_cols], on="_k", how="left").drop(columns="_k")
    g = np.log1p(ASSUMPTIONS["annual_appreciation"])
    yrs = valuation_year() - df.source.map(SOURCE_YEAR)
    df["y"] = np.log(df.ppsf) + g * yrs  # rolled forward to the valuation date (asking basis)
    df["locality_key"] = df.city + "|" + df.locality.fillna("").str.lower()
    # Locality-level robust trim: drop listings priced implausibly against their own locality
    # (typos in area/price, wrong unit, plot listed as flat). Applied before any split.
    lp = df["y"]
    g = lp.groupby(df.locality_key)
    med, n = g.transform("median"), g.transform("size")
    mad = ((lp - med).abs().groupby(df.locality_key).transform("median") * 1.4826).clip(lower=0.12)
    keep = ~((n >= 5) & (((lp - med) / mad).abs() > 3.0))
    print(f"locality trim removed {(~keep).sum()} rows ({(~keep).mean():.1%})")
    df = df[keep].reset_index(drop=True)
    return df, ae_cols


def fit_pca(df, ae_cols):
    u = df.drop_duplicates(["lat", "lon"])[ae_cols].dropna()
    pca = PCA(n_components=F.N_AE, random_state=0).fit(u.values)
    return pca


def ae_block(df, ae_cols, pca):
    A = df[ae_cols].values
    ok = np.isfinite(A).all(1)
    Z = np.full((len(df), F.N_AE), np.nan)
    if ok.any():
        Z[ok] = pca.transform(A[ok])
    return pd.DataFrame(Z, columns=[f"sat{i:02d}" for i in range(F.N_AE)], index=df.index)


def cold_comps(df_all, y_all, rows_df):
    """Comps for rows_df using only listings from *other* cities."""
    parts = []
    for c, sub in rows_df.groupby("city"):
        m = df_all.city.values != c
        ci = F.CompsIndex(df_all.lat.values[m], df_all.lon.values[m], y_all[m])
        p = ci.features(sub.lat.values, sub.lon.values)
        p.index = sub.index
        parts.append(p)
    return pd.concat(parts).loc[rows_df.index]


def make_X(df, comps, poi, ae, pca):
    X = F.base_frame(df)
    X = pd.concat([X, comps.set_index(df.index), poi.set_index(df.index), ae_block(df, ae, pca)], axis=1)
    X["knn_gap_centre"] = X["knn_wmean"]  # placeholder name kept stable for grouping
    X = X.drop(columns=["knn_gap_centre"])
    return X


def fit_lgb(X, y, rounds=ROUNDS, w=None, params=PARAMS):
    mono = [1 if c in ("knn_wmean", "knn_med10") else 0 for c in X.columns]
    ds = lgb.Dataset(X, y, weight=w, categorical_feature=[c for c in X.columns if str(X[c].dtype) == "category"],
                     free_raw_data=False)
    return lgb.train({**params, "monotone_constraints": mono, "monotone_constraints_method": "advanced"}, ds, rounds)


def metrics(price_true, price_pred, lo=None, hi=None):
    ape = np.abs(price_pred / price_true - 1)
    m = {"n": int(len(ape)), "MdAPE": float(np.median(ape)), "MAPE": float(ape.mean()),
         "PPE10": float((ape <= 0.10).mean()), "PPE20": float((ape <= 0.20).mean())}
    if lo is not None:
        for k in lo:
            m[f"cover_{k}"] = float(((price_true >= lo[k]) & (price_true <= hi[k])).mean())
            m[f"width_{k}"] = float(np.median(hi[k] / lo[k] - 1))
    return m


def density_bin(knn_d1):
    # 0: comps at the same locality point, 1: next locality over, 2: a few km, 3: no local evidence
    return np.digitize(knn_d1, [0.05, 1.0, 4.0])


class Engine:
    """Everything the API needs to value a property."""

    def __init__(self, **kw):
        self.__dict__.update(kw)


def run_split(name, df, y, poi, ae_cols, pca, tr_idx, cal_idx, te_idx, comps_mode):
    """Train on tr, calibrate on cal, evaluate on te. comps for te depend on mode."""
    tr, cal, te = df.loc[tr_idx], df.loc[cal_idx], df.loc[te_idx]
    folds = KFold(5, shuffle=True, random_state=1).split(tr)
    fold_id = np.zeros(len(tr), int)
    for k, (_, v) in enumerate(folds):
        fold_id[v] = k
    comps_tr = F.oof_comps(tr, y[tr_idx], fold_id)
    # cold-start augmentation
    cold_rows = tr.sample(frac=0.15, random_state=3)
    comps_cold = cold_comps(tr, y[tr_idx], cold_rows)
    ref = F.CompsIndex(tr.lat.values, tr.lon.values, y[tr_idx])
    comps_cal = ref.features(cal.lat.values, cal.lon.values)
    tr_keys = tr.locality_key.values
    loc_rows = tr.sample(frac=0.20, random_state=4)
    comps_loc = ref.features(loc_rows.lat.values, loc_rows.lon.values, own_keys=loc_rows.locality_key.values, ref_keys=tr_keys)
    comps_loc.index = loc_rows.index
    cal_loc = cal.sample(frac=0.30, random_state=5)
    comps_cal_loc = ref.features(cal_loc.lat.values, cal_loc.lon.values, own_keys=cal_loc.locality_key.values, ref_keys=tr_keys)
    if comps_mode == "cold":
        comps_te = cold_comps(tr, y[tr_idx], te)  # test city never in train anyway
    else:
        comps_te = ref.features(te.lat.values, te.lon.values)

    X_tr = make_X(tr, comps_tr, poi.loc[tr_idx], ae_cols, pca)
    X_cold = make_X(cold_rows, comps_cold, poi.loc[cold_rows.index], ae_cols, pca)
    X_loc = make_X(loc_rows, comps_loc, poi.loc[loc_rows.index], ae_cols, pca)
    X_fit = pd.concat([X_tr, X_cold, X_loc])
    y_fit = np.r_[y[tr_idx], y[cold_rows.index], y[loc_rows.index]]
    X_cal = pd.concat([make_X(cal, comps_cal, poi.loc[cal_idx], ae_cols, pca),
                       make_X(cal_loc, comps_cal_loc, poi.loc[cal_loc.index], ae_cols, pca)])
    y_cal = np.r_[y[cal_idx], y[cal_loc.index]]
    X_te = make_X(te, comps_te, poi.loc[te_idx], ae_cols, pca)
    for c in X_fit.columns:
        if str(X_fit[c].dtype) == "category":
            cats = X_fit[c].cat.categories
            X_cal[c] = pd.Categorical(X_cal[c].astype(str), categories=cats)
            X_te[c] = pd.Categorical(X_te[c].astype(str), categories=cats)

    # OOF residuals for the scale model
    oof = np.zeros(len(X_fit))
    kf = KFold(4, shuffle=True, random_state=2)
    for a, b in kf.split(X_fit):
        m = fit_lgb(X_fit.iloc[a], y_fit[a], rounds=900)
        oof[b] = m.predict(X_fit.iloc[b])
    model = fit_lgb(X_fit, y_fit)
    sp = dict(objective="regression", learning_rate=0.03, num_leaves=31, min_data_in_leaf=60, feature_fraction=0.8,
              verbose=-1)
    scale = lgb.train(sp, lgb.Dataset(X_fit, np.log(np.abs(y_fit - oof) + 0.02)), 600)

    def predict(X):
        mu = model.predict(X)
        sig = np.exp(scale.predict(X))
        return mu, sig

    mu_cal, sig_cal = predict(X_cal)
    s = np.abs(y_cal - mu_cal) / sig_cal
    b_cal = density_bin(X_cal["knn_d1"].values)
    qs = {}
    for k, a in LEVELS.items():
        glob = float(np.quantile(s, a * (1 + 1 / len(s))))
        qs[k] = {int(b): float(np.quantile(s[b_cal == b], min(1, a * (1 + 1 / max(1, (b_cal == b).sum())))))
                 if (b_cal == b).sum() > 200 else glob for b in range(4)}
        qs[k]["global"] = glob

    def intervals(mu, sig, X):
        b = density_bin(X["knn_d1"].values)
        lo, hi = {}, {}
        for k in LEVELS:
            q = np.array([qs[k].get(int(i), qs[k]["global"]) for i in b])
            lo[k], hi[k] = mu - q * sig, mu + q * sig
        return lo, hi

    mu_te, sig_te = predict(X_te)
    lo, hi = intervals(mu_te, sig_te, X_te)
    area = te.area_sqft.values
    P = lambda v: np.exp(v) * area  # noqa: E731
    true = P(y[te_idx])
    res = {"engine": metrics(true, P(mu_te), {k: P(v) for k, v in lo.items()}, {k: P(v) for k, v in hi.items()})}

    # ----- baselines (same time-aligned target, same test rows)
    city_med = pd.Series(y[tr_idx], index=tr.index).groupby(tr.city).median()
    glob_med = float(np.median(y[tr_idx]))
    b1 = te.city.map(city_med).fillna(glob_med).values
    res["city_median"] = metrics(true, P(b1))
    loc_med = pd.Series(y[tr_idx], index=tr.index).groupby(tr.locality_key).agg(["median", "size"])
    lm = te.locality_key.map(loc_med[loc_med["size"] >= 3]["median"])
    b2 = lm.fillna(pd.Series(b1, index=te.index)).values
    res["locality_median"] = metrics(true, P(b2))
    # hedonic ridge: log ppsf ~ city + log area + bhk + transaction + ptype
    def hed(d):
        H = pd.get_dummies(d[["city", "transaction", "ptype"]].astype(str), dtype=float)
        H["log_area"], H["bhk"] = np.log(d.area_sqft), d.bhk.fillna(2.0)
        return H
    Htr = hed(tr)
    Hte = hed(te).reindex(columns=Htr.columns, fill_value=0.0)
    r = Ridge(alpha=1.0).fit(Htr, y[tr_idx])
    res["hedonic_ridge"] = metrics(true, P(r.predict(Hte)))
    # attributes-only GBM (what a generic AVM without location intelligence does)
    attr_cols = [c for c in F.base_frame(tr).columns if c not in ("lat", "lon")]
    Xa_tr = F.base_frame(tr)[attr_cols].assign(city=tr.city.astype("category"))
    Xa_te = F.base_frame(te)[attr_cols].assign(city=pd.Categorical(te.city, categories=Xa_tr.city.cat.categories))
    for c in Xa_tr.columns:
        if str(Xa_tr[c].dtype) == "category":
            Xa_te[c] = pd.Categorical(Xa_te[c].astype(str), categories=Xa_tr[c].cat.categories)
    ga = lgb.train({**PARAMS}, lgb.Dataset(Xa_tr, y[tr_idx]), 1200)
    res["attributes_gbm"] = metrics(true, P(ga.predict(Xa_te)))

    # ----- ablations (retrain point model without a block)
    if name == "random":
        for tag, pref in (("no_satellite", "sat"), ("no_osm", ("d_", "n1_", "n3_")), ("no_comps", "knn_")):
            keep = [c for c in X_fit.columns if not c.startswith(pref)]
            m = fit_lgb(X_fit[keep], y_fit, rounds=1200)
            res[f"ablation_{tag}"] = metrics(true, P(m.predict(X_te[keep])))
    print(f"\n== {name} ==")
    print(pd.DataFrame(res).T[["n", "MdAPE", "MAPE", "PPE10", "PPE20"]].round(3).to_string())
    print({k: round(v, 3) for k, v in res["engine"].items() if k.startswith(("cover", "width"))})
    return res, dict(model=model, scale=scale, qs=qs, X_cols=list(X_fit.columns),
                     cats={c: list(X_fit[c].cat.categories) for c in X_fit.columns if str(X_fit[c].dtype) == "category"},
                     X_te=X_te, mu_te=mu_te, te_idx=te_idx)


def main():
    df, ae_cols = load()
    print("rows", len(df), "with satellite", round(df[ae_cols[0]].notna().mean(), 3))
    pca = fit_pca(df, ae_cols)
    pois = pd.read_parquet(PROC / "pois.parquet")
    pidx = F.PoiIndex(pois)
    u = df[["lat", "lon"]].drop_duplicates()
    pf = pidx.features(u.lat.values, u.lon.values)
    pf.index = pd.MultiIndex.from_frame(u)
    poi = pf.reindex(pd.MultiIndex.from_frame(df[["lat", "lon"]]))
    poi.index = df.index
    y = df["y"].values
    y_s = pd.Series(y, index=df.index)

    report = {}
    # split 1: random
    idx = RNG.permutation(df.index.values)
    n = len(idx)
    te, cal, tr = idx[: int(.15 * n)], idx[int(.15 * n): int(.30 * n)], idx[int(.30 * n):]
    report["random"], final = run_split("random", df, y_s, poi, ae_cols, pca, tr, cal, te, "warm")
    # split 2: unseen localities
    keys = df.locality_key.unique()
    RNG.shuffle(keys)
    hold = set(keys[: int(.15 * len(keys))])
    te2 = df.index[df.locality_key.isin(hold)].values
    rest = RNG.permutation(df.index[~df.locality_key.isin(hold)].values)
    cal2, tr2 = rest[: int(.15 * n)], rest[int(.15 * n):]
    report["unseen_locality"], _ = run_split("unseen_locality", df, y_s, poi, ae_cols, pca, tr2, cal2, te2, "warm")
    # split 3: unseen cities (tier-2 transfer)
    te3 = df.index[df.city.isin(HOLDOUT_CITIES)].values
    rest = RNG.permutation(df.index[~df.city.isin(HOLDOUT_CITIES)].values)
    cal3, tr3 = rest[: int(.15 * n)], rest[int(.15 * n):]
    report["unseen_city"], _ = run_split("unseen_city", df, y_s, poi, ae_cols, pca, tr3, cal3, te3, "cold")
    report["holdout_cities"] = HOLDOUT_CITIES
    report["assumptions"] = ASSUMPTIONS
    report["data"] = {"rows": int(len(df)), "cities": int(df.city.nunique()), "localities": int(df.locality_key.nunique()),
                      "by_source": df.source.value_counts().to_dict()}

    # ---- deployable engine = random-split models; comps index over train+cal (calibration untouched)
    ref_idx = np.r_[tr, cal]
    eng = Engine(model=final["model"], scale=final["scale"], qs=final["qs"], X_cols=final["X_cols"], cats=final["cats"],
                 pca=pca, ae_cols=ae_cols,
                 comps_ref=df.loc[ref_idx, ["lat", "lon", "city", "locality", "price", "area_sqft", "bhk", "ptype", "source",
                                            "transaction", "floor", "total_floors", "society"]].assign(y=y_s.loc[ref_idx].values),
                 city_stats=df.groupby("city").agg(lat=("centre_lat", "first"), lon=("centre_lon", "first"),
                                                   n=("y", "size"), med_y=("y", "median")).reset_index(),
                 assumptions=ASSUMPTIONS, report=report)
    # global SHAP-style importance from LightGBM contributions on the random test set
    contrib = final["model"].predict(final["X_te"], pred_contrib=True)
    imp = pd.Series(np.abs(contrib[:, :-1]).mean(0), index=final["X_cols"]).sort_values(ascending=False)
    report["importance"] = imp.round(5).to_dict()
    eng.report = report
    with open(ART / "engine.pkl", "wb") as f:
        pickle.dump(eng, f)
    json.dump(report, open(ART / "report.json", "w"), indent=2, default=float)
    print("\ntop features", imp.head(15).round(4).to_dict())


if __name__ == "__main__":
    main()
