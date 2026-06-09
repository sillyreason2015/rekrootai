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

    # hired/rejected split 50/50 so classes are balanced
    n_hired = rows // 2
    n_rejected = rows - n_hired
    records = []

    for label, n in [(1, n_hired), (0, n_rejected)]:
        for _ in range(n):
            group = random.choice(["A", "B"])
            gender = random.choice(["female", "male"])
            age = random.choice(["18-24", "25-34", "35-44", "45+"])
            eth = random.choice(["group1", "group2", "group3"])
            if label == 1:
                resume = clamp(random.gauss(72, 14), 0, 100)
                assessment = clamp(random.gauss(70, 14), 0, 100)
                interview = clamp(random.gauss(74, 13), 0, 100)
            else:
                resume = clamp(random.gauss(58, 14), 0, 100)
                assessment = clamp(random.gauss(57, 14), 0, 100)
                interview = clamp(random.gauss(54, 13), 0, 100)
            records.append({
                "resume": round(resume, 3),
                "assessment": round(assessment, 3),
                "interview": round(interview, 3),
                "label": label,
                "group": group,
                "gender": gender,
                "ageRange": age,
                "ethnicity": eth,
            })

    random.shuffle(records)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(records)
    print(f"wrote {rows} rows -> {OUT}")


if __name__ == "__main__":
    main()
