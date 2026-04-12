// Lightweight generative background for blog entries
(function () {
  const canvases = document.querySelectorAll('.blog-bg-canvas');
  if (canvases.length === 0) return;

  const vsSrc = 'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}';
  const fsSrc = `
precision mediump float;
uniform float t;
uniform vec2 res;
uniform vec3 baseCol;
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float n = 0.5 + 0.5 * sin(uv.x * 3.0 + t * 0.2 + sin(uv.y * 2.0 + t * 0.1));
  vec3 col = mix(vec3(0.05, 0.02, 0.1), baseCol, n * 0.2);
  gl_FragColor = vec4(col, 1.0);
}`;

  canvases.forEach(canvas => {
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    const prog = gl.createProgram();
    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const pLoc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

    const uT = gl.getUniformLocation(prog, 't'), uRes = gl.getUniformLocation(prog, 'res'), uCol = gl.getUniformLocation(prog, 'baseCol');
    
    // Read color from data attribute or CSS
    const hex = canvas.dataset.color || '#7c3aed';
    const r = parseInt(hex.substring(1,3), 16)/255, g = parseInt(hex.substring(3,5), 16)/255, b = parseInt(hex.substring(5,7), 16)/255;

    function render(ts) {
      gl.uniform1f(uT, ts * 0.001);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform3f(uCol, r, g, b);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }
    window.addEventListener('resize', resize);
    resize(); render(0);
  });
})();
