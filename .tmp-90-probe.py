import re
VAL = {-1.0: -2.0, -1.5: -3.0, -2.0: -4.0, -3.0: -6.0}
pat = r'hp:\s*(-[0-9.]+)'
s = "effects: { rep: 3, hp: -1 }, x: y"
print('pattern repr:', repr(pat))
print('match:', re.search(pat, s))
print('findall:', re.findall(pat, s))
