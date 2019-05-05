"use strict";
const kCompileApi = "https://us-central1-swiftwasm-zhuowei.cloudfunctions.net/compile/v1/compile";
const kPrecompiledDemo = false;

var codeArea = null;
var runButton = null;

function polyfillReady(polyfillFunction) {
    startWasiPolyfill = polyfillFunction;
}

function pageLoaded() {
    codeArea = document.getElementById("code-area");
    codeArea.disabled = false;
    if (codeArea.value == "") {
        codeArea.value = kDefaultDemoScript;
    }
    runButton = document.getElementById("run-button");
    runButton.addEventListener("click", runClicked);
}

async function runClicked() {
	runButton.disabled = true;
	const code = codeArea.value;
	try {
		const compileResult = await compileCode(code);
	} catch (e) {
		console.log(e);
	}
	runButton.disabled = false;
}

async function compileCode(code) {
	let compileResult = null;
	if (kPrecompiledDemo && code.strip() == kDefaultDemoScript.strip()) {
		return await getPrecompiledDemo();
	}
}

// Demo script
const kDefaultDemoScript = `import Glibc

// Print statements work

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
    if n <= 0 {
        return 0;
    }
    if n <= 2 {
        return 1;
    }
    var a = 1;
    var b = 1;
    for _ in 3...n {
        let newA = b;
        let newB = a + b;
        a = newA
        b = newB
    }
    return b
}

print("The 10th fibonacci number is \(fib(n: 10))")

// we can also run JavaScript from Swift.
// Here's a string holding JavaScript code, with some string interpolation:

let scriptSrc = """
    const div = document.createElement("div");
    div.textContent = "Hello from Swift! The 10th Fibonacci number is \(fib(n: 10))!";
    document.body.appendChild(div);
    alert("I'm called from Swift!");
"""

func executeScript(script: String) {
    // WASI doesn't specify a standard way to invoke JavaScript yet,
    // so this is a kludge.
    let magicFd:Int32 = -1337
    if write(magicFd, script, strlen(script)) == -1 {
    print("Can't execute script on this runtime: please use the SwiftWasm polyfill on https://swiftwasm.org.")
        print("The script is:")
        print(script)
    }
}

// and we can execute it.
executeScript(script: scriptSrc)
`;

pageLoaded();
