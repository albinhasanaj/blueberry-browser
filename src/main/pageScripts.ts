export type PageScript<TArgs, TResult> = (
  args: TArgs,
) => TResult | Promise<TResult>;

export function serializePageScript<TArgs, TResult>(
  script: PageScript<TArgs, TResult>,
  args: TArgs,
): string {
  // These scripts run in the page context, so they must be self-contained.
  return `(${script.toString()})(${JSON.stringify(args)})`;
}
