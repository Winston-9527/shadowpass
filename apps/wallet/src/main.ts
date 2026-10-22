import "./style.css";

const commit = import.meta.env.VITE_COMMIT_SHA as string | undefined;

const commitEl = document.querySelector<HTMLElement>("#commit");
if (commitEl && commit) commitEl.textContent = commit;

const yearEl = document.querySelector<HTMLElement>("#year");
if (yearEl) yearEl.textContent = `© ${new Date().getFullYear()} ShadowPass`;

// 占位页只负责让域名可访问；钱包 UI 落地后在这里挂载真正的应用。
