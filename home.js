"use strict";
const kCompileApi = "https://us-central1-swiftwasm-zhuowei.cloudfunctions.net/compile/v1/compile";
const kPrecompiledDemo = false;

var codeArea = null;
var runButton = null;
var outputArea = null;
var downloadWasmButton = null;
var currentDownloadURL = null;

function polyfillReady(polyfillFunction) {
    startWasiPolyfill = polyfillFunction;
}

function pageLoaded() {
    codeArea = document.getElementById("code-area");
    codeArea.disabled = false;
    if (codeArea.value == "") {
        codeArea.value = kDefaultDemoScript;
    }
    codeArea.addEventListener("keydown", handleCodeAreaKeyPress);
    runButton = document.getElementById("code-run");
    runButton.addEventListener("click", runClicked);
    outputArea = document.getElementById("output-area");
    downloadWasmButton = document.getElementById("code-download-wasm");
}

async function runClicked() {
    runButton.disabled = true;
    downloadWasmButton.style.display = "none";
    if (currentDownloadURL) {
        URL.revokeObjectURL(currentDownloadURL);
    }
    const code = codeArea.value;
    try {
        const compileResult = await compileCode(code);
        populateResultsArea(compileResult);
        if (compileResult.output.success) {
            runWasm(compileResult.binary);
        }
    } catch (e) {
        console.log(e);
    }
    runButton.disabled = false;
}

async function compileCode(code) {
    if (kPrecompiledDemo && code.strip() == kDefaultDemoScript.strip()) {
        return await getPrecompiledDemo();
    }
    const fetchResult = await fetch(kCompileApi, {
        method: "POST",
        body: JSON.stringify({
            src: code
        }),
        headers: {
            "Content-Type": "application/json"
        }
    });
    const resultBuffer = await fetchResult.arrayBuffer();
    return parseResultBuffer(resultBuffer);
}

/**
 * @param resultBuffer {ArrayBuffer}
 */
function parseResultBuffer(resultBuffer) {
    const textDecoder = new TextDecoder("utf-8");
    let uint32View = null;
    if (resultBuffer.byteLength >= 8) {
        uint32View = new Uint32Array(resultBuffer.slice(0, 8));
    }
    if (uint32View == null || uint32View[0] != 0xdec0ded0) {
        return {output:
            {success: false, output: textDecoder.decode(resultBuffer)}
        };
    }
    const jsonLength = uint32View[1];
    const jsonBuffer = resultBuffer.slice(8, 8 + jsonLength);
    let output = {
        output: JSON.parse(textDecoder.decode(jsonBuffer))
    };
    if (8 + jsonLength < resultBuffer.byteLength) {
        output.binary = resultBuffer.slice(8 + jsonLength);
    }
    return output;
}

/**
 * @param wasmBuffer {ArrayBuffer}
 */
function runWasm(wasmBuffer) {
    window.wasi_wasm_buffer = wasmBuffer;
    _handleFiles();
}

function populateResultsArea(compileResult) {
    console.log(compileResult);
    const output = compileResult.output;
    outputArea.textContent = output.output;
    downloadWasmButton.style.display = output.success? "": "none";
    if (compileResult.binary) {
        const blob = new Blob([compileResult.binary], {type: "application/wasm"});
        currentDownloadURL = URL.createObjectURL(blob);
        downloadWasmButton.href = currentDownloadURL;
    }
}

/**
 * 
 * @param {KeyboardEvent} event 
 */
function handleCodeAreaKeyPress(event) {
    if (event.keyCode == 9 /* tab */) {
        event.preventDefault();
        var selectionStart = codeArea.selectionStart;
        codeArea.value = codeArea.value.substring(0, selectionStart) +
            "    " + codeArea.value.substring(codeArea.selectionEnd);
        codeArea.selectionStart = codeArea.selectionEnd = selectionStart + 4;
        return false;
    }
    return true;
}

function wasi_handle_error(e) {
    Module.print(e.toString() + "\n" + e.stack);
}

// Demo script
const kDefaultDemoScript = `import Glibc

print("Hello, 🌐!")

// we can try loops and arithmetic:

func fizzBuzz(from: Int, to: Int) {
    for i in from...to {
        if i % 15 == 0 {
            print("FizzBuzz")
        } else if i % 3 == 0 {
            print("Fizz")
        } else if i % 5 == 0 {
            print("Buzz")
        } else {
            print(i)
        }
    }
}

fizzBuzz(from: 1, to: 20)

func fib(n: Int) -> Int {
    if n <= 0 { return 0 }
    if n <= 2 { return 1 }
    var a = 1;
    var b = 1;
    for _ in 3...n {
        let newA = b
        let newB = a + b
        a = newA
        b = newB
    }
    return b
}

print("The 10th Fibonacci number is \(fib(n: 10))")

// we can also run JavaScript from Swift.

func executeScript(script: String) {
    let magicFd:Int32 = -1337
    if write(magicFd, script, strlen(script)) == -1 {
        print("Can't execute script: please use the SwiftWasm polyfill on https://swiftwasm.org.")
        print(script)
    }
}

// Here's a string holding JavaScript code, with some string interpolation:
let scriptSrc = "alert('The 11th Fibonacci number is \(fib(n: 11))');"
// and we can execute it.
executeScript(script: scriptSrc)
`;

pageLoaded();
