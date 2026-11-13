"""Sample AlphaEarth embeddings at every unique listing coordinate."""
import numpy as np, pandas as pd, aef
from common import PROC
d = pd.read_parquet(PROC / "listings.parquet")
u = d[["lat", "lon"]].round(4).drop_duplicates().reset_index(drop=True)
E = aef.embed_many(u.values, workers=8)
out = pd.concat([u, pd.DataFrame(E, columns=[f"ae{i:02d}" for i in range(64)])], axis=1)
out.to_parquet(PROC / "aef_points.parquet")
print("embedded", np.isfinite(E[:, 0]).mean())
