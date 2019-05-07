// copied directly out of polyfill.html
      var statusElement = document.getElementById('status');

      var Module = {
        preRun: [],
        postRun: [],
        print: (function() {
          var element = document.getElementById('output-area');
          return function(text) {
            if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
            console.log(text);
            if (element) {
              element.textContent += text + "\n";
              element.scrollTop = element.scrollHeight; // focus on bottom
            }
          };
        })(),
        printErr: function(text) {
          if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
          console.error(text);
        },
        setStatus: function(text) {
          console.log(text);
        },
        totalDependencies: 0,
        monitorRunDependencies: function(left) {
          this.totalDependencies = Math.max(this.totalDependencies, left);
          Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
        }
      };
      Module.setStatus('Downloading...');
      window.onerror = function() {
        Module.setStatus('Exception thrown, see JavaScript console');
        Module.setStatus = function(text) {
          if (text) Module.printErr('[post-exception status] ' + text);
        };
      };
