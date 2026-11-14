"use strict";

const DEMO_REGION = Object.freeze({ x: 140, y: 160, width: 142, height: 122 });

function demoPortrait({ expression = "neutral", sleeve = false, shift = 0, width = 420,
  height = 540, opaque = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (opaque) {
    ctx.fillStyle = "#f1eee8";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(shift, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const path = (outline, fill, stroke = "#29233e", weight = 2.4) => {
    const shape = new Path2D(outline);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(shape);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = weight;
      ctx.stroke(shape);
    }
  };
  const gradient = (x1, y1, x2, y2, start, end) => {
    const paint = ctx.createLinearGradient(x1, y1, x2, y2);
    paint.addColorStop(0, start);
    paint.addColorStop(1, end);
    return paint;
  };
  const hair = gradient(120, 74, 302, 403, "#3d3454", "#211d35");
  const skin = gradient(168, 138, 245, 284, "#ffdfcb", "#e3a495");
  const jacket = gradient(108, 336, 285, 529, "#716483", "#46405f");
  const leftSleeve = sleeve ? gradient(73, 365, 147, 518, "#bb7273", "#783e58") : jacket;

  path("M128 121 C140 68 180 48 222 54 C277 51 309 94 315 149 L331 350 Q324 390 355 436 Q318 430 304 407 Q308 427 318 451 Q278 436 265 405 L147 416 Q114 449 82 440 Q108 405 109 373 Z", hair);
  path("M112 343 Q123 331 163 318 L187 308 L233 307 L258 319 Q298 330 308 344 C330 356 338 382 350 432 L369 514 Q330 526 280 526 L138 526 Q82 525 51 514 L70 433 Q86 363 112 343 Z", jacket);
  path("M114 346 Q92 358 81 394 L51 514 Q87 525 126 525 L145 472 Q147 443 153 413 Z", leftSleeve);
  path("M307 345 Q329 363 339 401 L369 514 Q327 525 291 525 L274 478 Q268 441 266 414 Z", jacket);
  path("M127 414 Q118 438 111 471 L106 506 M297 417 Q303 449 308 465 L313 506", null, "#3f3656", 2);
  path("M145 350 Q156 332 178 320 L243 320 Q263 330 278 351 L259 481 L261 525 L156 525 L161 485 Z", gradient(154, 335, 254, 523, "#f6edf1", "#b8aabe"));
  path("M181 273 L181 313 Q185 325 170 329 L211 358 L250 329 Q233 323 239 307 L240 271 Z", skin);
  path("M182 282 Q210 305 238 292 L237 308 Q207 324 182 308 Z", "#d59892", null);
  path("M174 321 L211 347 L190 372 L155 343 Z M245 320 L211 347 L232 372 L266 343 Z", "#f9edf4");
  path("M208 351 Q188 333 160 354 L164 389 Q185 393 209 365 Q234 393 257 389 L264 354 Q233 332 215 351 Z", gradient(172, 344, 247, 398, "#e0b779", "#a86b55"));
  path("M198 362 L171 414 L191 409 L197 421 L212 366 L230 416 L239 406 L252 412 L225 362 Z", "#b88161");
  path("M202 349 Q211 345 221 350 L222 366 Q211 370 202 366 Z", "#e1ad71");
  path("M146 363 L165 407 L168 467 L158 524 M275 363 L257 407 L254 467 L262 524", null, "#8e7b9b", 2.2);
  path("M71 493 L126 505 L122 523 M294 505 L351 493 L361 515", null, "#8e7b9b", 2.6);
  path("M206 444 L215 444 M206 466 L215 466 M205 488 L215 488", null, "#8c738d", 3);

  path("M143 192 C121 178 120 213 137 226 L152 231 M275 192 C298 178 302 210 284 226 L270 230", skin);
  path("M147 123 Q168 84 213 87 Q264 89 278 135 L278 195 C276 230 249 264 224 277 Q211 284 195 276 C170 263 148 239 144 212 Z", skin);
  path("M144 139 Q141 165 145 194 C153 178 156 153 163 141 Q161 161 153 169 C177 162 196 145 207 127 Q200 153 186 162 C219 153 236 133 242 120 Q249 148 272 168 L275 205 Q282 189 287 186 L301 151 Q298 109 278 89 C251 59 219 67 204 64 Q158 67 136 103 Q119 131 126 178 Z", hair);
  path("M136 145 Q148 94 199 82 Q166 106 151 137 Q169 119 182 115 Q161 141 146 157 Z", "#594766", null);
  path("M234 83 Q274 92 293 139 Q272 126 263 119 Q268 135 272 143 Q252 118 234 83 Z", "#574366", null);
  path("M134 179 C141 219 146 267 132 311 Q126 330 130 355 Q107 336 112 297 L119 220 Z M289 183 Q280 228 285 263 Q302 305 304 345 Q312 338 316 308 L307 229 Z", hair);
  path("M129 214 Q139 255 125 303 M296 219 Q285 261 301 303", null, "#594565", 2.2);
  path("M273 150 L292 134 L297 139 L278 155 Z M279 158 L299 142 L304 148 L284 164 Z", "#e5c18e", "#62465f", 1.6);

  const brows = {
    neutral: "M156 182 Q169 176 183 183 M237 183 Q250 176 264 182",
    smile: "M156 180 Q170 172 184 181 M236 181 Q250 172 264 180",
    frown: "M156 180 Q172 177 184 188 M237 188 Q251 177 264 180",
  };
  path(brows[expression], null, "#684957", 2.6);
  if (expression === "smile") {
    path("M153 201 Q169 184 188 199 M232 199 Q251 184 267 201", null, "#5a405b", 3.4);
  } else {
    path("M152 198 Q170 188 189 198 Q184 215 168 216 Q158 214 152 198 Z M232 198 Q249 188 268 198 Q262 216 248 216 Q237 214 232 198 Z", "#fff4ec", "#775971", 1.7);
    for (const x of [171, 249]) {
      ctx.fillStyle = "#5b8d82";
      ctx.beginPath();
      ctx.ellipse(x, 202, 8, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#334d48";
      ctx.beginPath();
      ctx.ellipse(x + 1, 202, 4.2, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff4f0";
      ctx.beginPath();
      ctx.arc(x - 2, 197, 2.9, 0, Math.PI * 2);
      ctx.fill();
    }
    path("M152 198 Q169 188 189 198 M232 198 Q249 188 268 198", null, "#4a364f", 3.2);
  }
  path("M211 210 L208 228 L215 230", null, "#b57977", 1.55);
  const mouths = {
    neutral: ["M198 248 Q210 251 223 247", null],
    smile: ["M196 244 Q211 251 225 244 Q220 260 210 259 Q201 258 196 244 Z", "#a75a67"],
    frown: ["M199 252 Q211 244 222 250", null],
  };
  path(...mouths[expression], "#854d60", 2);
  return canvas;
}

function demoFile(name, settings) {
  const canvas = demoPortrait(settings);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(new File([blob], name + ".png", { type: "image/png" }));
      else reject(new Error("Could not create demo image"));
    }, "image/png");
  });
}

function makeDemo() {
  return Promise.all([
    demoFile("01_基准·平静"),
    demoFile("02_微笑", { expression: "smile" }),
    demoFile("03_皱眉·衣袖变色", { expression: "frown", sleeve: true }),
    demoFile("04_整体偏移", { shift: 9 }),
    demoFile("05_画布尺寸不同", { width: 408, height: 520 }),
    demoFile("06_不透明背景", { opaque: true }),
  ]);
}
