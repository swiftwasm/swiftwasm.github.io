import Glibc

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

@_silgen_name("executeScript")
func executeScript(script: UnsafePointer<UInt8>, length: Int32)

// Here's a string holding JavaScript code, with some string interpolation:
var scriptSrc = "alert('Hello from Swift! The 11th Fibonacci number is \(fib(n: 11))');"
// and we can execute it.
scriptSrc.withUTF8 { bufferPtr in
  executeScript(script: bufferPtr.baseAddress!, length: Int32(bufferPtr.count))
}
