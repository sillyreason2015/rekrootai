from __future__ import annotations
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic_training.csv"


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def main(rows: int = 2500):
    random.seed(42)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = ["resume", "assessment", "interview", "label", "group", "gender", "ageRange", "ethnicity"]
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for _ in range(rows):
            group = random.choice(["A", "B"])
            gender = random.choice(["female", "male"])
            age = random.choice(["18-24", "25-34", "35-44", "45+"])
            eth = random.choice(["group1", "group2", "group3"])
            resume = clamp(random.gauss(68, 16), 0, 100)
            assessment = clamp(random.gauss(65, 18), 0, 100)
            interview = clamp(random.gauss(70, 14), 0, 100)
            bias = -0.03 if group == "B" else 0.0
            score = 0.35 * resume + 0.35 * assessment + 0.30 * interview
            prob = clamp((score / 100.0) + bias, 0.0, 1.0)
            label = 1 if random.random() < prob else 0
            w.writerow({
                "resume": round(resume, 3),
                "assessment": round(assessment, 3),
                "interview": round(interview, 3),
                "label": label,
                "group": group,
                "gender": gender,
                "ageRange": age,
                "ethnicity": eth,
            })
    print(f"wrote {rows} rows -> {OUT}")


if __name__ == "__main__":
    main()
