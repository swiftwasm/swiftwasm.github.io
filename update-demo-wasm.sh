curl 'https://swiftwasm-compiler-api-mgv5x4syda-uc.a.run.app/' \
  -o ./public/demo_compiled/program.wasm.txt \
  -H 'content-type: application/json' \
  --data-raw "$(jq -n --arg data "$(cat ./src/demo.swift)" '{"mainCode":$data,"action":"emitExecutable"}')"
