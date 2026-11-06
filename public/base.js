/**
 * Global Controller
 * 전역 상태 관리 및 GNB UI 처리
 */
document.addEventListener('DOMContentLoaded', () => {
    initGlobalAuthUI();
});

async function initGlobalAuthUI() {
    const area = document.getElementById('user-status-area');

    try {
        const response = await fetch('/api/v1/auth/me');
        const session = await response.json();

        if (session.is_logged_in) {
            // 권한에 따른 닉네임 색상 처리
            const isAdmin = session.server_role === "STAFF" || session.server_role === "주인장";
            const nickColor = isAdmin ? "var(--accent-hero)" : "var(--text-main)"; // 테마 컬러 적용

            area.innerHTML = `
                <div class="user-card logged-in" style="display:flex; align-items:center; gap:8px;">
                    <span class="user-job-tag" style="color:var(--accent-hero); font-size:0.75rem; border:1px solid var(--accent-hero); padding:2px 6px; border-radius:4px; background:rgba(0, 242, 254, 0.05);">${escapeHTML(session.job_name)}</span>
                    <span class="user-nick" style="font-weight:bold; color:${nickColor};">${escapeHTML(session.nickname)}</span>
                    <button onclick="logout()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">로그아웃</button>
                </div>
            `;
        } else {
            area.innerHTML = `
                <div class="user-card guest" style="text-align: right;">
                    <div style="font-size:0.8rem; color:var(--text-main);">상태: 게스트</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">디스코드에서 /위키 입력 시 로그인 가능</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

async function logout() {
    try {
        const res = await fetch('/api/v1/auth/logout', { method: 'POST' });
        if (res.ok) location.reload();
    } catch (e) {
        console.error('Logout failed:', e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const currentPath = window.location.pathname;

    const gnbLink = document.querySelector(`.gnb-nav a[href="${currentPath}"]`);

    if (gnbLink) {
        gnbLink.style.color = '#FFFFFF';
        gnbLink.style.fontWeight = 'bold';
        gnbLink.style.textShadow = '0 0 12px color-mix(in srgb, var(--accent-hero) 40%, transparent)';
        gnbLink.style.transform = 'scale(1.1)';
        gnbLink.style.display = 'inline-block';
    }
});

function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>'"]/g, match => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escapeMap[match];
    });
}