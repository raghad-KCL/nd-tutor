"""Tokeniser and normaliser for propositional logic formula strings."""

import re
from dataclasses import dataclass
from typing import List

# ----------------------------
# Token definition
# ----------------------------


@dataclass(frozen=True)
class Token:
    """A single lexical token from a formula string.

    Attributes:
        kind: Token category — one of ``"ATOM"``, ``"NOT"``, ``"AND"``,
            ``"OR"``, ``"IMP"``, ``"IFF"``, ``"LPAREN"``, ``"RPAREN"``,
            or ``"EOF"``.
        value: The raw lexeme text.
        pos: 0-based character position in the normalised input string.
    """

    kind: str   # "ATOM", "NOT", "AND", "OR", "IMP", "IFF", "LPAREN", "RPAREN", "EOF"
    value: str
    pos: int


# ----------------------------
# Normalisation rules
# ----------------------------

# Word operators (whole words only)
WORD_OPS = {
    "not": "¬",
    "and": "∧",
    "or":  "∨",
}

# Multi-character ASCII operators
ASCII_OPS_MULTI = {
    "<->": "↔",
    "<=>": "↔",
    "->":  "→",
    "=>":  "→",
}

# Single-character ASCII operators
ASCII_OPS_SINGLE = {
    "~": "¬",
    "!": "¬",
    "&": "∧",
    "^": "∧",
    "|": "∨",
}

# Regex to safely match whole-word operators only
WORD_OPS_REGEX = re.compile(r"\b(not|and|or)\b", flags=re.IGNORECASE)


def _normalise(s: str) -> str:
    """Normalises ASCII and word-based operators to Unicode symbols.

    Applies three replacement passes in order:
    1. Whole-word operators (``not``, ``and``, ``or``) → Unicode.
    2. Multi-character ASCII operators (``<->``, ``->``, etc.) → Unicode.
    3. Single-character ASCII operators (``~``, ``&``, ``|``, etc.) → Unicode.

    Args:
        s: Raw formula string.

    Returns:
        The formula string with all operators in Unicode form.
    """
    s = s.strip()

    # 1) Replace word operators (safe: won't touch variable names)
    def repl(m):
        return WORD_OPS[m.group(1).lower()]
    s = WORD_OPS_REGEX.sub(repl, s)

    # 2) Replace multi-character ASCII operators FIRST
    for k, v in ASCII_OPS_MULTI.items():
        s = s.replace(k, v)

    # 3) Replace single-character ASCII operators
    for k, v in ASCII_OPS_SINGLE.items():
        s = s.replace(k, v)

    return s


def normalise_only(s: str) -> str:
    """Normalises operator syntax without tokenising.

    Args:
        s: Raw formula string.

    Returns:
        The formula with operators normalised to Unicode symbols.
    """
    return _normalise(s)



# ----------------------------
# Tokenization
# ----------------------------

# Atoms: letter followed by letters/digits/underscores
TOKEN_REGEX = re.compile(
    r"\s*(¬|∧|∨|→|↔|\(|\)|[A-Za-z][A-Za-z0-9_]*)"
)


def tokenize(formula: str) -> List[Token]:
    """Normalises and tokenises a propositional logic formula string.

    Args:
        formula: Raw formula string (may use ASCII or Unicode operators).

    Returns:
        A list of ``Token`` objects ending with an ``EOF`` token.

    Raises:
        ValueError: If the input contains an unrecognised character.
    """
    text = _normalise(formula)
    tokens: List[Token] = []
    i = 0

    while i < len(text):
        m = TOKEN_REGEX.match(text, i)
        if not m:
            raise ValueError(
                f"Unexpected character at position {i}: '{text[i]}'"
            )

        lex = m.group(1)

        kind = {
            "¬": "NOT",
            "∧": "AND",
            "∨": "OR",
            "→": "IMP",
            "↔": "IFF",
            "(": "LPAREN",
            ")": "RPAREN",
        }.get(lex, "ATOM")

        tokens.append(Token(kind, lex, i))
        i = m.end()

    tokens.append(Token("EOF", "", len(text)))
    return tokens
