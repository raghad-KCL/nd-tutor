from .tokens import tokenize
from .parser import Parser, ParseError

def parse_formula(s: str):
    tokens = tokenize(s)
    return Parser(tokens).parse()
