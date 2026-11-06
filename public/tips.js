if (typeof escapeHTML === 'undefined') {
    window.escapeHTML = function(str) {
        if (!str) return "";
        return String(str).replace(/[&<>'"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[m]));
    };
}

let currentCategory = 'BUILD';
let currentPage = 1;
let currentEditingId = null;
let currentUser = null;
let openAccordionIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
    const tipsBoard = document.getElementById('tips-board');
    const isLoggedIn = tipsBoard && tipsBoard.dataset.loggedIn === 'true';

    if (!isLoggedIn) {
        if (tipsBoard) {
            tipsBoard.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, true);
        }
        return;
    }
    loadTips();
    setupFilters();
});



function setupFilters() {
    const buttons = document.querySelectorAll('.tag-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            currentCategory = e.target.getAttribute('data-category');
            currentPage = 1;
            openAccordionIds.clear();

            const writeBtn = document.getElementById('writeTipBtn');
            writeBtn.style.display = (currentCategory === 'QNA') ? 'inline-block' : 'none';

            loadTips();
        });
    });
}

async function loadTips() {
    if (!currentUser) {
        try {
            const userResp = await fetch('/api/v1/auth/me');
            if (userResp.ok) currentUser = await userResp.json();
        } catch (e) {
            console.error("유저 정보 로드 실패", e);
        }
    }

    try {
        const response = await fetch(`/api/v1/tips/?category=${currentCategory}&page=${currentPage}`);
        const data = await response.json();
        renderTips(data.tips);
    } catch (e) {
        console.error("게시글 로드 실패", e);
    }
}

function renderTips(tips) {
    const feedArea = document.getElementById('feedArea');
    if (!tips || tips.length === 0) {
        feedArea.innerHTML = '<div class="empty-msg">등록된 게시글이 없습니다.</div>';
        return;
    }

    feedArea.innerHTML = tips.map(tip => {
        const dateStr = new Date(tip.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const isAuthor = currentUser && String(currentUser.discord_id) === String(tip.author_id);
        const isAdmin = currentUser && currentUser.server_role === 'admin';

        // QNA 카테고리이면서 본인/관리자일 경우 컨트롤 버튼 생성
        const showControls = (tip.category === 'QNA' && (isAuthor || isAdmin));
        const controlButtons = showControls ? `
            <div class="tip-controls">
                ${isAuthor ? `<button class="text-btn edit" onclick="openEditModal(event, ${tip.tip_id}, \`${escapeHTML(tip.title)}\`, \`${escapeHTML(tip.content.replace(/"/g, '&quot;'))}\`)">수정</button>` : ''}
                <button class="text-btn delete" onclick="deleteTip(event, ${tip.tip_id})">삭제</button>
            </div>
        ` : '';

        // 유튜브 임베드 생성
        let youtubeHtml = '';
        if (tip.youtube_urls && Array.isArray(tip.youtube_urls) && tip.youtube_urls.length > 0) {
            youtubeHtml = tip.youtube_urls.map(url => {
                const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\n]+)/);
                if (videoIdMatch && videoIdMatch[1]) {
                    return `<div class="youtube-wrapper"><iframe src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
                }
                return '';
            }).join('');
        }

        // 마크다운 파싱 (marked.js 필요)
        const escapedContent = tip.content ? tip.content.replace(/^\s*>>/gm, match => match.replace(/>/g, '\\>')) : '';
        const parsedContent = typeof marked !== 'undefined' ? DOMPurify.sanitize(marked.parse(escapedContent, { breaks: true })) : `<p>${escapeHTML(tip.content)}</p>`;

        // QNA 카테고리일 경우 댓글 영역 추가
        const commentSection = (tip.category === "QNA") ? `
            <div class="comment-section" id="comment-area-${tip.tip_id}">
                <div class="comment-list" id="comment-list-${tip.tip_id}"></div>
                <div class="comment-input-area">
                    <input type="text" id="comment-input-${tip.tip_id}" class="form-input" placeholder="댓글을 남겨보세요..." onkeypress="if(event.key==='Enter') submitComment(${tip.tip_id})">
                    <button class="btn-primary" onclick="submitComment(${tip.tip_id})">등록</button>
                </div>
            </div>
        ` : '';

        return `
            <div class="tip-card" id="tip-card-${tip.tip_id}">
                <div class="tip-header" onclick="toggleAccordion(${tip.tip_id})">
                    <div class="tip-meta">
                        <strong class="tip-title">${escapeHTML(tip.title)}</strong>
                        <div class="tip-info">
                            <span class="author">${escapeHTML(tip.author_nickname)}</span>
                            <span class="date">${dateStr}</span>
                        </div>
                    </div>
                    ${controlButtons}
                </div>
                <div class="tip-body" id="tip-body-${tip.tip_id}" style="display: none;">
                    <div class="tip-markdown">${parsedContent}</div>
                    ${youtubeHtml}
                    ${commentSection}
                </div>
            </div>
        `;
    }).join('');

    // 기존에 열려있던 아코디언 복구
    openAccordionIds.forEach(id => {
        const body = document.getElementById(`tip-body-${id}`);
        if (body) {
            body.style.display = 'block';
            document.getElementById(`tip-card-${id}`).classList.add('open');
            if (currentCategory === 'QNA') loadComments(id);
        }
    });
}

function toggleAccordion(tipId) {
    const body = document.getElementById(`tip-body-${tipId}`);
    const card = document.getElementById(`tip-card-${tipId}`);

    if (body.style.display === 'none' || body.style.display === '') {
        body.style.display = 'block';
        card.classList.add('open');
        openAccordionIds.add(tipId);
        if (currentCategory === 'QNA') {
            loadComments(tipId);
        }
    } else {
        body.style.display = 'none';
        card.classList.remove('open');
        openAccordionIds.delete(tipId);
    }
}

function openWriteModal() {
    currentEditingId = null;
    const modal = document.getElementById('writeModal');
    modal.style.display = 'flex';
    modal.querySelector('.modal-header h3').innerText = "작성하기";

    document.getElementById('tipPrefixInput').value = '질문';
    document.getElementById('tipTitleInput').value = '';
    document.getElementById('tipContentInput').value = '';

    const submitBtn = modal.querySelector('.modal-actions .btn-primary');
    if (submitBtn) submitBtn.innerText = "등록하기";
}

function openEditModal(event, tipId, title, content) {
    event.stopPropagation(); // 아코디언 열림 방지
    currentEditingId = tipId;

    const match = title.match(/^\[(질문|팁|잡담)\]\s*(.*)$/);
    if (match) {
        document.getElementById('tipPrefixInput').value = match[1];
        document.getElementById('tipTitleInput').value = match[2];
    } else {
        document.getElementById('tipPrefixInput').value = '질문';
        document.getElementById('tipTitleInput').value = title;
    }

    document.getElementById('tipContentInput').value = content.replace(/&quot;/g, '"');

    const modal = document.getElementById('writeModal');
    modal.style.display = 'flex';
    modal.querySelector('.modal-header h3').innerText = "게시글 수정";

    const submitBtn = modal.querySelector('.modal-actions .btn-primary');
    if (submitBtn) submitBtn.innerText = "수정 적용";
}

function closeWriteModal() {
    document.getElementById('writeModal').style.display = 'none';
}

async function submitTip() {
    const prefix = document.getElementById('tipPrefixInput').value;
    const rawTitle = document.getElementById('tipTitleInput').value.trim();
    const content = document.getElementById('tipContentInput').value.trim();

    if (!rawTitle || !content) {
        alert("제목과 본문을 모두 입력해주세요.");
        return;
    }

    const title = `[${prefix}] ${rawTitle}`;
    const method = currentEditingId ? 'PATCH' : 'POST';
    const url = currentEditingId ? `/api/v1/tips/${currentEditingId}` : '/api/v1/tips/';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, category: currentCategory })
        });

        if (response.ok) {
            closeWriteModal();
            loadTips();
        } else {
            const err = await response.json();
            alert(`오류: ${err.detail || "등록 실패"}`);
        }
    } catch (error) {
        console.error("Submit error:", error);
        alert("네트워크 오류가 발생했습니다.");
    }
}

async function loadComments(tipId) {
    try {
        const response = await fetch(`/api/v1/tips/${tipId}/comments`);
        const data = await response.json();
        const listArea = document.getElementById(`comment-list-${tipId}`);

        if (!data.comments || data.comments.length === 0) {
            listArea.innerHTML = '<div class="empty-comment">첫 번째 댓글을 남겨보세요.</div>';
            return;
        }

        listArea.innerHTML = data.comments.map(c => {
            const isCommentAuthor = currentUser && String(currentUser.discord_id) === String(c.author_id);
            const isAdmin = currentUser && currentUser.server_role === 'admin';
            return `
                <div class="comment-item">
                    <div class="comment-meta">
                        <strong class="author">${escapeHTML(c.author_nickname)}</strong>
                        <span class="date">${c.created_at}</span>
                    </div>
                    <div class="comment-content">
                        ${escapeHTML(c.content)}
                        ${(isCommentAuthor || isAdmin) ? `<button class="text-btn delete sm" onclick="deleteComment(${c.comment_id}, ${tipId})">[삭제]</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("댓글 로드 실패", e);
    }
}

async function submitComment(tipId) {
    const input = document.getElementById(`comment-input-${tipId}`);
    const content = input.value.trim();
    if (!content) return;

    try {
        const response = await fetch(`/api/v1/tips/${tipId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });

        if (response.ok) {
            input.value = '';
            loadComments(tipId);
        } else {
            alert("댓글 등록에 실패했습니다.");
        }
    } catch (error) {
        console.error("댓글 작성 오류", error);
    }
}

async function deleteTip(event, tipId) {
    event.stopPropagation(); // 아코디언 열림 방지
    if (!confirm("게시글을 삭제하시겠습니까?")) return;

    try {
        const response = await fetch(`/api/v1/tips/${tipId}`, { method: 'DELETE' });
        if (response.ok) {
            openAccordionIds.delete(tipId);
            loadTips();
        } else {
            alert("삭제 권한이 없거나 실패했습니다.");
        }
    } catch (e) {
        console.error("삭제 오류", e);
    }
}

async function deleteComment(commentId, tipId) {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    try {
        const resp = await fetch(`/api/v1/tips/${tipId}/comments/${commentId}`, { method: 'DELETE' });
        if (resp.ok) loadComments(tipId);
    } catch (e) {
        console.error("댓글 삭제 오류", e);
    }
}