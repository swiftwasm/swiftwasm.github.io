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
import JavaScriptKit

let reply = JSObject.global.prompt!("Please input number here")
let alert = JSObject.global.alert!
if let n = Int(reply.string!) {
    alert("The \(n)th Fibonacci number is \(fib(n: n))")
} else {
    alert("\(reply) is not a number :(")
}
