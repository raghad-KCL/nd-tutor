"""Convenience wrapper that tokenises and parses a formula string in one step."""

from .tokens import tokenize
from .parser import Parser, ParseError


def parse_formula(s: str):
    """Tokenises and parses a formula string into an AST.

    Args:
        s: A propositional logic formula string (ASCII or Unicode
            operators accepted).

    Returns:
        The root ``Formula`` AST node.

    Raises:
        ValueError: If tokenisation encounters an invalid character.
        ParseError: If the token stream is not a well-formed formula.
    """
    tokens = tokenize(s)
    return Parser(tokens).parse()
