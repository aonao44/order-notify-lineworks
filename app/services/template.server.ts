/**
 * テンプレート内の {{変数名}} を実際の値に置換する
 */
export function renderTemplate(
  template: string,
  context: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] ?? "";
  });
}
