"""Built-in problem set for the natural-deduction tutor.

Each entry is a dict with ``id``, ``premises``, ``conclusion``,
``difficulty`` (``"easy"``/``"medium"``/``"hard"``), ``score``, and
complexity metrics (``depth``, ``distinct_vars``,
``proof_structure_factor``).
"""

PROBLEMS = [
    # ── Easy (score ≤ 4) ────────────────────────────────────────────────────
    {
        "id": "easy_1",
        "premises": ["P∧Q"],
        "conclusion": "Q∧P",
        "difficulty": "easy",
        "score": 4,
        "depth": 2,
        "distinct_vars": 2,
        "proof_structure_factor": 0,
    },
    {
        "id": "easy_2",
        "premises": ["P∧Q"],
        "conclusion": "P∨Q",
        "difficulty": "easy",
        "score": 4,
        "depth": 2,
        "distinct_vars": 2,
        "proof_structure_factor": 0,
    },

    # ── Medium (score 5–7) ──────────────────────────────────────────────────
    {
        "id": "medium_1",
        "premises": ["P∧(Q∧R)"],
        "conclusion": "(P∧Q)∧R",
        "difficulty": "medium",
        "score": 5,
        "depth": 2,
        "distinct_vars": 3,
        "proof_structure_factor": 0,
    },
    {
        "id": "medium_2",
        "premises": ["Q"],
        "conclusion": "P→Q",
        "difficulty": "medium",
        "score": 5,
        "depth": 2,
        "distinct_vars": 2,
        "proof_structure_factor": 1,
    },
    {
        "id": "medium_3",
        "premises": ["P→Q", "¬Q"],
        "conclusion": "¬P",
        "difficulty": "medium",
        "score": 5,
        "depth": 2,
        "distinct_vars": 2,
        "proof_structure_factor": 1,
    },
    {
        "id": "medium_4",
        "premises": ["(P→Q)∧(Q→R)"],
        "conclusion": "P→R",
        "difficulty": "medium",
        "score": 7,
        "depth": 3,
        "distinct_vars": 3,
        "proof_structure_factor": 1,
    },

    # ── Hard (score ≥ 8) ────────────────────────────────────────────────────
    {
        "id": "hard_1",
        "premises": ["P∧Q→R"],
        "conclusion": "P→(Q→R)",
        "difficulty": "hard",
        "score": 8,
        "depth": 3,
        "distinct_vars": 3,
        "proof_structure_factor": 2,
    },
    {
        "id": "hard_2",
        "premises": ["P→(Q→R)"],
        "conclusion": "P∧Q→R",
        "difficulty": "hard",
        "score": 8,
        "depth": 3,
        "distinct_vars": 3,
        "proof_structure_factor": 2,
    },
    {
        "id": "hard_3",
        "premises": ["P→Q∧R"],
        "conclusion": "(P→Q)∧(P→R)",
        "difficulty": "hard",
        "score": 8,
        "depth": 3,
        "distinct_vars": 3,
        "proof_structure_factor": 2,
    },
    {
        "id": "hard_4",
        "premises": ["B", "R∨S→A", "R∨S", "A∧R→C", "B∧S→C"],
        "conclusion": "C",
        "difficulty": "hard",
        "score": 9,
        "depth": 3,
        "distinct_vars": 5,
        "proof_structure_factor": 1,
    },
]
