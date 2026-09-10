"""
Minimal reader for the JavaScript object/array literals embedded in the figure
scripts on the MIL-HDBK-5 chapter pages.

json.loads cannot be used on them: keys are unquoted, strings are single-quoted,
and dataset entries refer to previously declared variables (``data: d1``).  This
walks the literal instead, returning plain Python values and leaving bare
identifiers as Ref objects for the caller to resolve.

Only the subset the chapter pages actually use is supported.
"""

import re


class Ref(str):
    """A bare identifier appearing where a value was expected (e.g. ``d1``)."""


_NUM = re.compile(r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_IDENT = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")


class Parser(object):
    def __init__(self, s, i=0):
        self.s = s
        self.i = i

    def ws(self):
        s, n = self.s, len(self.s)
        while self.i < n:
            c = s[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif s.startswith("//", self.i):
                j = s.find("\n", self.i)
                self.i = n if j < 0 else j + 1
            elif s.startswith("/*", self.i):
                j = s.find("*/", self.i)
                self.i = n if j < 0 else j + 2
            else:
                break

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "'\"":
            return self.string()
        m = _NUM.match(self.s, self.i)
        if m and (c.isdigit() or c in "-." ):
            self.i = m.end()
            t = m.group()
            return float(t) if ("." in t or "e" in t or "E" in t) else int(t)
        m = _IDENT.match(self.s, self.i)
        if m:
            self.i = m.end()
            word = m.group()
            if word == "true":
                return True
            if word == "false":
                return False
            if word in ("null", "undefined"):
                return None
            return Ref(word)
        raise ValueError("unexpected %r at %d" % (c, self.i))

    def string(self):
        q = self.s[self.i]
        self.i += 1
        out = []
        while True:
            c = self.s[self.i]
            if c == "\\":
                nxt = self.s[self.i + 1]
                out.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
                self.i += 2
            elif c == q:
                self.i += 1
                return "".join(out)
            else:
                out.append(c)
                self.i += 1

    def key(self):
        self.ws()
        if self.s[self.i] in "'\"":
            return self.string()
        m = _IDENT.match(self.s, self.i)
        if not m:
            raise ValueError("bad key at %d" % self.i)
        self.i = m.end()
        return m.group()

    def obj(self):
        self.i += 1                       # '{'
        out = {}
        while True:
            self.ws()
            if self.s[self.i] == "}":
                self.i += 1
                return out
            k = self.key()
            self.ws()
            assert self.s[self.i] == ":", "expected ':' at %d" % self.i
            self.i += 1
            out[k] = self.value()
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1

    def arr(self):
        self.i += 1                       # '['
        out = []
        while True:
            self.ws()
            if self.s[self.i] == "]":
                self.i += 1
                return out
            out.append(self.value())
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1


def parse_at(src, i):
    """Parse one literal starting at index i; returns (value, end_index)."""
    p = Parser(src, i)
    v = p.value()
    return v, p.i


def read_args(src, open_paren):
    """Read a comma-separated argument list starting at the '(' index."""
    p = Parser(src, open_paren + 1)
    args = []
    while True:
        p.ws()
        if p.s[p.i] == ")":
            p.i += 1
            return args, p.i
        args.append(p.value())
        p.ws()
        if p.s[p.i] == ",":
            p.i += 1
