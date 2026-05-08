import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => ({
      invalidate() {},
      render(width: number): string[] {
        const branch = footerData.getGitBranch() || "no git";
        const model = ctx.model?.id || "no model";
        
        const messages = ctx.agent?.state?.messages || [];
        let totalEstimatedTokens = 0;

        for (const msg of messages) {
          let chars = 0;
          if (msg.role === "user") {
            if (typeof msg.content === "string") {
              chars = msg.content.length;
            } else if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "text") chars += block.text.length;
              }
            }
          } else if (msg.role === "assistant") {
            for (const block of (msg.content as any[]) || []) {
              if (block.type === "text") chars += block.text.length;
              else if (block.type === "thinking") chars += block.thinking.length;
              else if (block.type === "toolCall") chars += block.name.length + JSON.stringify(block.arguments).length;
            }
          } else if (msg.role === "custom" || msg.role === "toolResult") {
            if (typeof msg.content === "string") {
              chars = msg.content.length;
            } else if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "text") chars += block.text.length;
                else if (block.type === "image") chars += 4800;
              }
            }
          } else if (msg.role === "bashExecution") {
            chars = ((msg as any).command?.length || 0) + ((msg as any).output?.length || 0);
          }
          totalEstimatedTokens += Math.ceil(chars / 4);
        }

        const modelLimit = (ctx.model as any).contextWindow || 128000;
        const percent = Math.min(totalEstimatedTokens / modelLimit, 1);
        
        const barWidth = 10;
        const filledWidth = Math.round(percent * barWidth);
        const bar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);
        
        const statusText = `${branch} | ${model} | [${bar}] ${Math.round(percent * 100)}% ctx (${totalEstimatedTokens})`;
        
        return [theme.fg("dim", statusText)];
      },
      dispose: footerData.onBranchChange(() => tui.requestRender()),
    }));
  });
}
