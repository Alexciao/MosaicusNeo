import { parseExpr, compile, zeros, extrema, intersections, niceNumber, niceStep, fmtValue, GraphError } from "../toolbox/graph-engine.js";
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log("FAIL", m); } };
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
const F = (src, P = {}, o) => { const { ast } = parseExpr(src); const f = compile(ast, o); return (x) => f(x, P); };
const val = (src, x, P, o) => F(src, P, o)(x);

// basic
ok(val("x^2", 3) === 9, "x^2");
ok(val("2x+1", 3) === 7, "2x+1");
ok(val("x^{2}-4", 3) === 5, "x^{2}-4");
ok(near(val("\\frac{1}{x}", 4), 0.25), "frac");
ok(near(val("\\frac{x+1}{x-1}", 3), 2), "frac2");
ok(near(val("\\sqrt{x}", 9), 3), "sqrt");
ok(near(val("\\sqrt[3]{x}", -8), -2), "cube root neg");
ok(near(val("x^{1/3}".replace("1/3","\\frac{1}{3}"), -8), -2), "x^(1/3) real");
ok(near(val("\\sin(x)", Math.PI / 2), 1), "sin");
ok(near(val("\\sin x", Math.PI / 2), 1), "sin x no bracket");
ok(near(val("\\sin(x)", 90, {}, { deg: true }), 1), "sin deg");
ok(near(val("\\arctan(1)", 0, {}, { deg: true }), 45), "arctan deg");
ok(near(val("\\sin^{-1}(1)", 0), Math.PI / 2), "sin^-1");
ok(near(val("\\sin^2(x)", Math.PI / 6), 0.25), "sin^2");
ok(near(val("\\ln(x)", Math.E), 1), "ln");
ok(near(val("\\log(x)", 1000), 3), "log");
ok(near(val("\\log_{2}(x)", 8), 3), "log base");
ok(near(val("e^x", 1), Math.E), "e^x");
ok(near(val("2^x", 10), 1024), "2^x");
ok(near(val("|x|", -3), 3), "abs");
ok(near(val("|x-2|+1", 0), 3), "abs expr");
ok(near(val("2\\pi x", 1), 2 * Math.PI), "2pi x");
ok(val("-x^2", 3) === -9, "-x^2");
ok(val("x(x+1)", 2) === 6, "implicit mult");
ok(val("(x+1)(x-1)", 3) === 8, "paren mult");
ok(val("2x^2-3x", 2) === 2, "poly");
ok(near(val("3\\sin(2x)", Math.PI / 4), 3), "3sin2x");
ok(near(val("x\\cdot x", 4), 16), "cdot");
ok(near(val("1{,}5x", 2), 3), "decimal comma");
ok(near(val("a x^2 + b x + c".replace(/ /g, ""), 2, { a: 1, b: 2, c: 3 }), 11), "params");
ok(near(val("a\\sin(bx)", Math.PI / 2, { a: 2, b: 1 }), 2), "a sin bx");
ok(near(val("ax", 3, { a: 4 }), 12), "ax");
ok([...parseExpr("ax^2+bx+c").params].sort().join("") === "abc", "params detected");
ok(parseExpr("x^2").params.size === 0, "no params");
ok(near(val("x^{-1}", 4), 0.25), "neg exponent");
ok(near(val("\\frac{\\sqrt{x}}{2}", 16), 2), "nested");
ok(near(val("|x|^2", -3), 9), "abs power"); ok(near(val("abs(x)", -3), 3), "abs(x) letters"); ok(near(val("abs\\left(x-1\\right)", -3), 4), "abs left");
ok(near(val("\\left|x\\right|", -5), 5), "left right abs");
ok(near(val("x^2+\\frac{1}{2}", 0), 0.5), "x^2+1/2");
ok(near(val("2^{x+1}", 2), 8), "2^{x+1}");
ok(near(val("e^{-x^2}", 0), 1), "gaussian");
ok(near(val("\\sqrt{x^2+1}", 0), 1), "sqrt expr");
ok(near(val("\\sin(x)\\cos(x)", Math.PI / 4), 0.5), "sin cos product");
ok(near(val("x^3-x", 2), 6), "x^3-x");
ok(near(val("\\pi", 0), Math.PI), "pi");

ok(near(val("\\sin\\left(x\\right)^2", Math.PI / 6), 0.25), "sin(x)^2 = (sin x)^2");
ok(near(val("\\sin\\left(x\\right)^{2}+\\cos\\left(x\\right)^{2}", 1.234), 1), "sin2+cos2");
ok(near(val("\\sin x^2", 2), Math.sin(4)), "sin x^2 = sin(x^2)");
ok(near(val("\\ln\\left(x\\right)^2", Math.E), 1), "ln(x)^2");
// errors
for (const bad_ of ["", "x+", "(x", "x^", "\\frac{1}{", "y+1", "\\placeholder{}", "x+\\placeholder{}"]) {
  let t = false; try { parseExpr(bad_); } catch (e) { t = e instanceof GraphError; }
  ok(t, "error for " + JSON.stringify(bad_));
}

// analysis
{
  const f = F("x^2-4");
  const z = zeros(f, -10, 10); ok(z.length === 2 && near(z[0], -2) && near(z[1], 2), "zeros x^2-4 " + z);
  const e = extrema(f, -10, 10); ok(e.length === 1 && e[0].kind === "min" && near(e[0].x, 0, 1e-5) && near(e[0].y, -4), "min " + JSON.stringify(e));
}
{
  const f = F("\\sin(x)"); const z = zeros(f, -7, 7);
  ok(z.length === 5, "sin zeros " + z.length);
  const e = extrema(f, 0, 7); ok(e.length === 2 && e[0].kind === "max" && near(e[0].x, Math.PI / 2, 1e-5), "sin extrema");
}
{
  const f = F("\\tan(x)"); const z = zeros(f, -1.5, 1.5); ok(z.length === 1 && near(z[0], 0), "tan zeros no poles " + z);
  const f2 = F("\\frac{1}{x}"); ok(zeros(f2, -5, 5).length === 0, "1/x no zeros");
  ok(extrema(f2, -5, 5, 10).length === 0, "1/x no extrema");
  ok(extrema(f, -4, 4, 10).length === 0, "tan no extrema");
}
{
  const f = F("x^3-3x"); const e = extrema(f, -3, 3);
  ok(e.length === 2 && e[0].kind === "max" && near(e[0].x, -1, 1e-5) && near(e[0].y, 2), "cubic extrema " + JSON.stringify(e));
  ok(zeros(f, -3, 3).length === 3, "cubic zeros");
}
{
  const f = F("x^2"), g = F("x+2");
  const s = intersections(f, g, -5, 5); ok(s.length === 2 && near(s[0].x, -1) && near(s[1].x, 2) && near(s[1].y, 4), "intersections " + JSON.stringify(s));
}
{
  const f = F("|x|"); const e = extrema(f, -3, 3); ok(e.length === 1 && e[0].kind === "min" && near(e[0].x, 0, 1e-4), "abs min " + JSON.stringify(e));
  const f2 = F("\\sqrt{x}"); ok(zeros(f2, -2, 4).length === 1, "sqrt zero at boundary of domain");
  const f3 = F("x^2"); const z = zeros(f3, -2, 2); ok(z.length <= 1, "double root tolerated " + z);
}
{
  const f = F("a x^2", { a: 1 }); ok(near(f(3), 9), "param closure");
}

// labels
ok(niceNumber(0.5) === "1/2", "1/2");
ok(niceNumber(-0.75) === "−3/4", "-3/4");
ok(niceNumber(2) === "2", "2");
ok(niceNumber(-3) === "−3", "-3");
ok(niceNumber(Math.PI / 2) === "π/2", "pi/2 " + niceNumber(Math.PI / 2));
ok(niceNumber(3 * Math.PI / 4) === "3π/4", "3pi/4");
ok(niceNumber(Math.PI) === "π", "pi");
ok(niceNumber(-2 * Math.PI) === "−2π", "-2pi");
ok(niceNumber(1.41421356) === "1.4142", "sqrt2 " + niceNumber(1.41421356));
ok(niceNumber(1e-14) === "0", "tiny");
{ const e = extrema(F("\\sin(x)"), -6, 0); ok(niceNumber(e[0].x) === "−3π/2" && niceNumber(e[0].y) === "1", "extremum label " + niceNumber(e[0].x) + " " + niceNumber(e[0].y)); }
{ const z = zeros(F("\\sin(x)"), 3, 4); ok(niceNumber(z[0]) === "π", "zero label"); }
ok(niceNumber(1 / 3) === "1/3", "1/3");
ok(niceStep(20) === 2, "step 20 " + niceStep(20));
ok(niceStep(10) === 1, "step 10 " + niceStep(10));
ok(niceStep(0.5) === 0.05 || niceStep(0.5) === 0.1, "step .5 " + niceStep(0.5));
ok(fmtValue(0.1 + 0.2) === "0.3", "fmt 0.3 " + fmtValue(0.1 + 0.2));
ok(fmtValue(NaN) === "—", "fmt nan");
ok(fmtValue(-2) === "−2", "fmt -2");

console.log(bad ? `${bad} FAILED of ${n}` : `all passed (${n})`);
process.exit(bad ? 1 : 0);
