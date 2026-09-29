// Guards against stored XSS: record fields interpolated into HTML templates in the apps must go
// through esc() (or escJsArg() inside onclick="...('...')" strings). The check parses the inline
// scripts and flags `${record.field}` style values in any template literal that builds HTML.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Helpers that return plain user text and therefore need escaping when put into HTML.
const TEXT_FUNCTIONS = new Set(["path", "label", "addTypeLabel", "costLabel", "fmtDate", "displayCode", "normalizedType"]);
const NUMERIC_PROPERTIES = new Set(["length", "size"]);

function unescapedValues(file) {
  const content = readFileSync(path.join(ROOT, file), "utf8");
  const html = file.endsWith('.js') ? `<script>${content}</script>` : content;
  const findings = [];
  const scripts = /<script>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scripts.exec(html))) {
    const offset = match.index + "<script>".length;
    const source = ts.createSourceFile(file, match[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const report = (node) => findings.push(`${file}:${html.slice(0, offset + node.getStart()).split("\n").length} \${${node.getText()}}`);

    const check = (node) => {
      switch (node.kind) {
        case ts.SyntaxKind.ParenthesizedExpression:
          return check(node.expression);
        case ts.SyntaxKind.PropertyAccessExpression:
          if (!NUMERIC_PROPERTIES.has(node.name.text)) report(node);
          return;
        case ts.SyntaxKind.ElementAccessExpression:
          return report(node);
        case ts.SyntaxKind.CallExpression:
          if (TEXT_FUNCTIONS.has(node.expression.getText())) report(node);
          return;
        case ts.SyntaxKind.BinaryExpression:
          if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) {
            check(node.left);
            check(node.right);
          }
          return;
        case ts.SyntaxKind.ConditionalExpression:
          check(node.whenTrue);
          check(node.whenFalse);
          return;
      }
    };

    const isHtml = (template) => /<[a-zA-Z/!]/.test(template.head.text + template.templateSpans.map((span) => span.literal.text).join(""));
    const visit = (node, insideHtml) => {
      let inside = insideHtml;
      if (node.kind === ts.SyntaxKind.TemplateExpression && (insideHtml || isHtml(node))) {
        for (const span of node.templateSpans) check(span.expression);
        inside = true;
      }
      ts.forEachChild(node, (child) => visit(child, inside));
    };
    visit(source, false);
  }
  return findings;
}

for (const file of ["index.html", "field.html", "assets/work-orders.js", "assets/field-work-orders.js"]) {
  test(`${file} escapes record values in HTML`, () => {
    // Counts and lengths are numbers and fine to insert as they are.
    const findings = unescapedValues(file).filter((finding) => !/\$\{(counts\[\w+\]|g\.(span|week)|\w+Str\.split\('-W'\)\[1\])\}$/.test(finding));
    assert.deepEqual(findings, [], "wrap these values in esc() (or escJsArg() inside onclick strings)");
  });
}
