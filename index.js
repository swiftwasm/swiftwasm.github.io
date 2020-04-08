"use strict";
const kCompileApi = "https://us-central1-swiftwasm-zhuowei.cloudfunctions.net/compile/v1/compile";
const kPrecompiledDemo = true;

const kDownloadUrls = {
    macos: ["macOS", "https://github.com/swiftwasm/swift/releases/download/swiftwasm-release-v20190510/swiftwasm-sdk-macos.tar.xz"],
    linux: ["Linux", "https://github.com/swiftwasm/swift/releases/download/swiftwasm-release-v20190510/swiftwasm-sdk-linux.tar.xz"]
}

var codeArea = null;
var runButton = null;
var outputArea = null;
var downloadWasmButton = null;
var currentDownloadURL = null;

function writeOutputArea(text) {
    var element = document.getElementById('output-area');
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
    console.log(text);
    if (element) {
        element.textContent += text;
        element.scrollTop = element.scrollHeight; // focus on bottom
    }
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
    setupDownloadArea();
    document.getElementById("emaillink").href = "mailto:" + atob("aGVsbG9Ac3dpZnR3YXNtLm9yZw==");
}

async function runClicked() {
    runButton.disabled = true;
    downloadWasmButton.style.display = "none";
    outputArea.textContent = "Compiling...";
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
    if (kPrecompiledDemo && code.trim() == kDefaultDemoScript.trim()) {
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
        return {
            output:
                { success: false, output: textDecoder.decode(resultBuffer) }
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

import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";

/**
 * @param wasmBuffer {ArrayBuffer}
 */
async function runWasm(wasmBuffer) {
    window.wasi_wasm_buffer = wasmBuffer;
    writeOutputArea("Running WebAssembly...\n");
    const wasmFs = new WasmFs();
    const decoder = new TextDecoder("utf-8");

    wasmFs.volume.fds[1].node.write = (stdoutBuffer) => {
        const text = decoder.decode(stdoutBuffer);
        writeOutputArea(text)
        return stdoutBuffer.length;
    }

    wasmFs.volume.fds[2].node.write = (stderrBuffer) => {
        const text = decoder.decode(stderrBuffer);
        console.error(text)
        return stdoutBuffer.length;
    }
    const wasi = new WASI({
        bindings: {
            ...WASI.defaultBindings,
            fs: wasmFs.fs
        }
    });

    let _instance;
    const importObject = {
        env: {
            executeScript: (ptr, len) => {
                const uint8Memory = new Uint8Array(_instance.exports.memory.buffer)
                const script = decoder.decode(uint8Memory.subarray(ptr, ptr + len));
                new Function(script)()
            }
        }
    }

    const { instance } = await WebAssembly.instantiate(wasmBuffer, {
        wasi_snapshot_preview1: wasi.wasiImport,
        wasi_unstable: wasi.wasiImport,
        ...importObject,
    });

    _instance = instance
    wasi.start(instance);
}

function populateResultsArea(compileResult) {
    console.log(compileResult);
    const output = compileResult.output;
    outputArea.textContent = output.output;
    downloadWasmButton.style.display = output.success ? "" : "none";
    if (compileResult.binary) {
        const blob = new Blob([compileResult.binary], { type: "application/wasm" });
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

function setupDownloadArea() {
    const downloadButton = document.getElementById("download-button");
    const platform = detectPlatform();
    const isWindows = platform == "windows";
    const platformActual = isWindows ? "linux" : platform;
    const platformName = isWindows ? "Windows" : kDownloadUrls[platformActual][0];
    const downloadUrl = kDownloadUrls[platformActual][1];
    downloadButton.textContent = "Download for " + platformName;
    downloadButton.href = downloadUrl;
    if (isWindows) {
        document.getElementById("windows-wsl").textContent = "Requires Windows Subsystem for Linux. ";
    }
}

function detectPlatform() {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf("Mac OS X") != -1) {
        return "macos";
    }
    if (userAgent.indexOf("Windows") != -1) {
        return "windows";
    }
    return "linux";
}

async function getPrecompiledDemo() {
    const fetchResult = await fetch("/demo_compiled/program.wasm.txt");
    const resultBuffer = await fetchResult.arrayBuffer();
    return {
        output: {
            success: true,
            output: ""
        },
        binary: resultBuffer
    }
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

print("The 10th Fibonacci number is \\(fib(n: 10))")

// we can also run JavaScript from Swift.

@_silgen_name("executeScript")
func executeScript(script: UnsafePointer<UInt8>, length: Int32)

// Here's a string holding JavaScript code, with some string interpolation:
var scriptSrc = "alert('Hello from Swift! The 11th Fibonacci number is \\(fib(n: 11))');"
// and we can execute it.
scriptSrc.withUTF8 { bufferPtr in
   executeScript(script: bufferPtr.baseAddress!, length: Int32(bufferPtr.count))
}
`;

pageLoaded();
