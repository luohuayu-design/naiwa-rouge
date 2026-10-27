#!/bin/sh
# 第 94 块回归：全部纯 Node 套件跑一遍，只报挂了的
fail=0
for f in .tmp-block*-test.mjs .tmp-gift-test.mjs .tmp-story-test.mjs; do
  out=$(node "$f" 2>&1)
  code=$?
  name=$(basename "$f")
  if [ $code -ne 0 ]; then
    fail=1
    echo "FAIL $name"
    echo "$out" | grep -E "XX|失败|Error" | head -12
  else
    line=$(echo "$out" | grep -E "通过 [0-9]+" | tail -1)
    echo "ok   $name  $line"
  fi
done
exit $fail
