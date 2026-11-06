if (typeof escapeHTML === 'undefined') {
    window.escapeHTML = function(str) {
        if (!str) return "";
        return String(str).replace(/[&<>'"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[m]));
    };
}

const API_BASE = '/api/v1/boards';
const BOARD_TYPE = window.BOARD_TYPE;
let currentPage = 1;
let currentTag = "";
let isAdmin = false;
let currentEditNoticeId = null;



function removeDiscordMentions(str) {
    if (!str) return '';
    return str.replace(/@[\u200B\s]*(everyone|here)/g, '')
              .replace(/<@[!&]?\d+>/g, '')
              .trim();
}

function getTagTheme(tag) {
    if (BOARD_TYPE === 'event') return { color: '#e056fd', bg: 'rgba(224, 86, 253, 0.1)' }; // Neon Pink
    switch(tag) {
        case '업데이트': return { color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.1)' }; // Green
        case '서버 상태 공지': return { color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.1)' }; // Red
        case '직업 공지': return { color: '#f1c40f', bg: 'rgba(241, 196, 15, 0.1)' }; // Yellow
        case '시스템 공지': return { color: '#9b59b6', bg: 'rgba(155, 89, 182, 0.1)' }; // Purple
        case '일반 공지': default: return { color: '#3498db', bg: 'rgba(52, 152, 219, 0.1)' }; // Blue
    }
}

// =============================================
//  Core Logic
// =============================================

async function checkAuthAndLoad() {
    try {
        const res = await fetch('/api/v1/auth/me');
        const auth = await res.json();
        if (auth.is_logged_in && (auth.server_role === "STAFF" || auth.server_role === "주인장")) {
            isAdmin = true;
        }
    } catch (e) {
        console.error("권한 확인 실패", e);
    }
    loadFeed(1);
}

async function loadFeed(page) {
    const feedArea = document.getElementById("feedArea");
    feedArea.innerHTML = '<div style="text-align:center; color:#888;">게시글을 불러오는 중입니다...</div>';

    let url = `${API_BASE}/${BOARD_TYPE}?page=${page}`;
    if (currentTag) url += `&tag=${encodeURIComponent(currentTag)}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("API 요청 실패");
        const data = await res.json();

        let isLastPage = data.notices.length < 5;

        if (data.notices.length === 5) {
            let nextUrl = `${API_BASE}/${BOARD_TYPE}?page=${page + 1}`;
            if (currentTag) nextUrl += `&tag=${encodeURIComponent(currentTag)}`;
            try {
                const nextRes = await fetch(nextUrl);
                if (nextRes.ok) {
                    const nextData = await nextRes.json();
                    if (nextData.notices.length === 0) {
                        isLastPage = true;
                    }
                }
            } catch (ignore) { /* 무시 */ }
        }

        renderFeed(data.notices);
        renderPagination(data.page, isLastPage);
        currentPage = page;

    } catch (e) {
        console.error("게시판 로드 및 렌더링 에러:", e);
        feedArea.innerHTML = '<div style="text-align:center; color:#e74c3c;">게시글을 불러오지 못했습니다.</div>';
    }
}

function renderFeed(notices) {
    const feedArea = document.getElementById("feedArea");
    if (!notices || notices.length === 0) {
        feedArea.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding: 60px; background: rgba(11, 12, 26, 0.4); border: 1px solid var(--border-color); border-radius: 0px; backdrop-filter: blur(12px);">게시글이 없습니다.</div>';
        return;
    }

    marked.setOptions({ breaks: true, gfm: true });

    const html = notices.map(notice => {
        let timelineDate = "00.00";
        let cardTime = "00:00";

        try {
            const rawDate = notice.created_at;
            const d = new Date(rawDate);

            if (!isNaN(d.getTime())) {
                const kstOptions = {
                    timeZone: 'Asia/Seoul',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                };
                const formatter = new Intl.DateTimeFormat('ko-KR', kstOptions);
                const parts = formatter.formatToParts(d);

                let month, day, hour, minute;
                parts.forEach(part => {
                    if (part.type === 'month') month = part.value;
                    if (part.type === 'day') day = part.value;
                    if (part.type === 'hour') hour = part.value;
                    if (part.type === 'minute') minute = part.value;
                });

                timelineDate = `${month}.${day}`;
                cardTime = `${hour}:${minute}`;
            } else if (typeof rawDate === 'string') {
                timelineDate = rawDate.substring(5, 10).replace('-', '.');
                cardTime = rawDate.substring(11, 16);
            }
        } catch (e) {
            console.warn("날짜 파싱 오류, 원본 데이터:", notice.created_at);
        }

        const cleanContent = removeDiscordMentions(notice.content);
        const escapedContent = cleanContent.replace(/^\s*>>/gm, match => match.replace(/>/g, '\\>'));
        const parsedContent = DOMPurify.sanitize(marked.parse(escapedContent, { breaks: true }));

        const safeTitle = notice.title ? escapeHTML(notice.title) : "";
        const titleHtml = `<h3 id="notice-title-${notice.notice_id}" class="board-card-title" style="${safeTitle ? '' : 'display: none;'}">${safeTitle}</h3>`;

        let imagesHtml = "";
        if (notice.image_urls && notice.image_urls.length > 0) {
            const url = notice.image_urls[0];
            imagesHtml = `
                <div class="board-card-image-container loading">
                    <img src="${escapeHTML(url)}" onload="this.parentElement.classList.remove('loading'); if(window.initReadMore) window.initReadMore();" onerror="this.parentElement.style.display='none'" onclick="openLightbox(this.src)">
                </div>
            `;
        }

        const tagTheme = getTagTheme(notice.tag);

        let adminPanel = "";
        if (isAdmin) {
            const oppositeType = BOARD_TYPE === 'notice' ? 'event' : 'notice';
            const oppositeLabel = BOARD_TYPE === 'notice' ? '이벤트로 이관' : '공지로 이관';
            const escapedCurrentTitle = safeTitle.replace(/'/g, "\\'");
            const popupBtn = BOARD_TYPE === 'event'
                ? `<button onclick="setAsPopup(${notice.notice_id})" class="admin-btn admin-btn-popup">팝업 등록</button>`
                : '';

            adminPanel = `
                <div class="board-card-admin">
                    ${popupBtn}
                    <button onclick="changeNoticeType(${notice.notice_id}, '${oppositeType}')" class="admin-btn admin-btn-move">${oppositeLabel}</button>
                    ${BOARD_TYPE === 'notice' ? `<button id="tag-btn-${notice.notice_id}" onclick="promptTagChange(${notice.notice_id}, '${notice.tag}')" class="admin-btn admin-btn-tag">태그 변경</button>` : ''}
                    <button onclick="openTitleModal(${notice.notice_id}, '${escapedCurrentTitle}')" class="admin-btn admin-btn-title">제목 수정</button>
                    <button onclick="deleteNotice(${notice.notice_id})" class="admin-btn admin-btn-delete">삭제</button>
                </div>
            `;
        }

        return `
            <div id="notice-card-${notice.notice_id}" class="board-card-wrapper">
                <div class="timeline-indicator">
                    <div class="timeline-dot" style="border-color: ${tagTheme.color}; box-shadow: 0 0 10px ${tagTheme.bg};"></div>
                    <div class="timeline-date">${timelineDate}</div>
                </div>
                <div class="board-card">
                    <div class="board-card-header">
                        <span id="notice-tag-${notice.notice_id}" class="board-tag" style="color: ${tagTheme.color}; background: ${tagTheme.bg}; border: 1px solid ${tagTheme.color}40;">
                            ${BOARD_TYPE === 'notice' ? `[${notice.tag}]` : 'EVENT'}
                        </span>
                        <span class="board-date">${cardTime}</span>
                    </div>
                    ${titleHtml}
                    <div class="board-content-wrapper">
                        <div class="board-content markdown-body">
                            ${parsedContent}
                        </div>
                    </div>
                    <div class="read-more-action" style="display: none;">
                        <button class="read-more-btn" onclick="toggleReadMore(this)">
                            <span class="btn-text">더보기</span>
                            <i class="fa-solid fa-angles-down btn-icon"></i>
                        </button>
                    </div>
                    ${imagesHtml}
                    ${adminPanel}
                </div>
            </div>
        `;
    }).join("");

    feedArea.innerHTML = html;
    setTimeout(window.initReadMore, 50);

    let glowLine = document.getElementById("timeline-glow");
    if (!glowLine) {
        glowLine = document.createElement("div");
        glowLine.id = "timeline-glow";
        glowLine.className = "timeline-glow";
        feedArea.prepend(glowLine);
    }

    setTimeout(() => {
        const wrappers = document.querySelectorAll('.board-card-wrapper');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (window.scrollY < 50 && entry.target === wrappers[0]) return;

                if (entry.isIntersecting) {
                    entry.target.classList.add('focused');

                    if (glowLine) {
                        const dotCenterY = entry.target.offsetTop + 31;
                        glowLine.style.transform = `translateY(${dotCenterY - 60}px)`;
                    }
                } else {
                    entry.target.classList.remove('focused');
                }
            });
        }, {
            root: null,
            rootMargin: '-40% 0px -40% 0px',
            threshold: 0
        });

        wrappers.forEach(wrapper => observer.observe(wrapper));

        const handleTopScroll = () => {
            if (window.scrollY < 50 && wrappers[0]) {
                wrappers[0].classList.add('focused');
                if (glowLine) {
                    const dotCenterY = wrappers[0].offsetTop + 31;
                    glowLine.style.transform = `translateY(${dotCenterY - 60}px)`;
                }
            }
        };

        window.addEventListener('scroll', handleTopScroll, { passive: true });
        handleTopScroll();
    }, 50);

    const targetId = new URLSearchParams(window.location.search).get('id');
    if (targetId) {
        setTimeout(() => {
            const targetEl = document.getElementById(`notice-card-${targetId}`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const targetCard = targetEl.querySelector('.board-card');
                if(targetCard) {
                    targetCard.style.transition = 'box-shadow 0.6s ease-out, border-color 0.6s ease-out';
                    targetCard.style.boxShadow = '0 0 25px rgba(0, 242, 254, 0.4)';
                    targetCard.style.borderColor = 'var(--accent-hero)';
                    setTimeout(() => {
                        targetCard.style.boxShadow = 'none';
                        targetCard.style.borderColor = 'var(--border-color)';
                    }, 2500);
                }

                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }, 150);
    }
}

function renderPagination(currentPage, isLastPage) {
    const pageArea = document.getElementById("paginationArea");
    let html = "";

    if (currentPage > 1) {
        html += `<button onclick="loadFeed(${currentPage - 1})" class="page-btn">&lt; 이전</button>`;
    }

    html += `<button class="page-btn active">${currentPage}</button>`;

    if (!isLastPage) {
         html += `<button onclick="loadFeed(${currentPage + 1})" class="page-btn">다음 &gt;</button>`;
    }

    pageArea.innerHTML = html;
}

// =============================================
//  Admin API Calls (Local DOM Update 적용)
// =============================================

function removeCardFromDOM(id) {
    const card = document.getElementById(`notice-card-${id}`);
    if (card) {
        card.remove(); // DOM 요소 즉시 삭제

        // 지운 후 현재 화면에 게시글이 하나도 안 남았다면 빈 상태 처리
        const feedArea = document.getElementById("feedArea");
        if (feedArea.children.length === 0) {
            // 1페이지가 아니라면 이전 페이지로 자연스럽게 이동시킴
            if (currentPage > 1) {
                loadFeed(currentPage - 1);
            } else {
                feedArea.innerHTML = '<div style="text-align:center; color:#555; padding: 40px; background: #13132b; border-radius: 0px;">게시글이 없습니다.</div>';
            }
        }
    }
}

async function changeNoticeType(id, targetType) {
    if (!confirm(`이 게시글을 ${targetType === 'event' ? '이벤트' : '공지사항'} 게시판으로 이동하시겠습니까?`)) return;
    try {
        const res = await fetch(`${API_BASE}/${id}/type?target_type=${targetType}`, { method: 'PUT' });
        if (res.ok) {
            removeCardFromDOM(id);
        } else alert("권한이 없거나 처리 중 오류가 발생했습니다.");
    } catch (e) { alert("통신 오류가 발생했습니다."); }
}

function promptTagChange(id, currentTag) {
    currentEditNoticeId = id;
    const select = document.getElementById("newTagSelect");

    const options = Array.from(select.options);
    const exists = options.some(opt => opt.value === currentTag);
    if (exists) select.value = currentTag;
    else select.selectedIndex = 0;

    document.getElementById("tagModal").classList.add("open");
}

function closeTagModal() {
    document.getElementById("tagModal").classList.remove("open");
    currentEditNoticeId = null;
}

async function submitTagChange() {
    if (!currentEditNoticeId) return;
    const newTag = document.getElementById("newTagSelect").value;

    try {
        const res = await fetch(`${API_BASE}/${currentEditNoticeId}/tag?target_tag=${encodeURIComponent(newTag)}`, { method: 'PUT' });
        if (res.ok) {
            // 화면 텍스트 즉시 갈아끼우기
            const tagElement = document.getElementById(`notice-tag-${currentEditNoticeId}`);
            if (tagElement) {
                tagElement.textContent = `[${newTag}]`;
            }

            // 다음에 다시 수정 버튼을 누를 때 반영되도록 onclick 속성 업데이트
            const editBtn = document.getElementById(`tag-btn-${currentEditNoticeId}`);
            if (editBtn) {
                editBtn.setAttribute("onclick", `promptTagChange(${currentEditNoticeId}, '${newTag}')`);
            }

            closeTagModal();
        } else {
            alert("권한이 없거나 처리 중 오류가 발생했습니다.");
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    }
}

async function deleteNotice(id) {
    if (!confirm("정말 이 게시글을 삭제하시겠습니까?\n(데이터베이스와 스토리지가 최적화됩니다)")) return;
    try {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            removeCardFromDOM(id);
        } else alert("권한이 없거나 삭제 중 오류가 발생했습니다.");
    } catch (e) { alert("통신 오류가 발생했습니다."); }
}

window.setAsPopup = async function(id) {
    if (!confirm('이 이벤트를 메인 페이지 팝업으로 등록하시겠습니까?\n(기존 팝업은 일반 이벤트로 변경됩니다)')) return;
    try {
        const res = await fetch(`${API_BASE}/${id}/popup`, { method: 'PATCH' });
        if (res.ok) {
            alert('팝업으로 등록되었습니다.');
            loadFeed(currentPage);
        } else {
            alert("권한이 없거나 처리 중 오류가 발생했습니다.");
        }
    } catch (e) { alert("통신 오류가 발생했습니다."); }
};

// =============================================
//  Modal Controls (Title)
// =============================================
let currentEditTitleNoticeId = null;

function openTitleModal(id, currentTitle) {
    currentEditTitleNoticeId = id;
    document.getElementById("newTitleInput").value = currentTitle || "";
    document.getElementById("titleModal").classList.add("open");
}

function closeTitleModal() {
    document.getElementById("titleModal").classList.remove("open");
    currentEditTitleNoticeId = null;
    document.getElementById("newTitleInput").value = "";
}

async function submitTitleChange() {
    if (!currentEditTitleNoticeId) return;

    const newTitle = document.getElementById("newTitleInput").value;

    try {
        const res = await fetch(`${API_BASE}/${currentEditTitleNoticeId}/title`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });

        if (res.ok) {
            const titleEl = document.getElementById(`notice-title-${currentEditTitleNoticeId}`);
            if (titleEl) {
                if (newTitle.trim() === "") {
                    titleEl.style.display = "none";
                    titleEl.innerText = "";
                } else {
                    titleEl.innerText = newTitle;
                    titleEl.style.display = "block";
                    titleEl.style.marginBottom = "10px";
                }
            }

            const editBtn = document.querySelector(`button[onclick^="openTitleModal(${currentEditTitleNoticeId}"]`);
            if (editBtn) {
                const escapedNewTitle = newTitle.replace(/'/g, "\\'");
                editBtn.setAttribute("onclick", `openTitleModal(${currentEditTitleNoticeId}, '${escapedNewTitle}')`);
            }

            closeTitleModal();
        } else {
            alert("권한이 없거나 처리 중 오류가 발생했습니다.");
        }
    } catch (e) {
        alert("통신 오류가 발생했습니다.");
    }
}

// =============================================
//  Event Listeners
// =============================================

document.querySelectorAll(".tag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tag-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentTag = btn.dataset.tag;
        loadFeed(1);
    });
});

function openLightbox(src) {
    const lb = document.getElementById("lightbox");
    lb.querySelector("img").src = src;
    lb.classList.add("open");
}

document.addEventListener("click", e => {
    if (e.target.closest("#lightbox")) {
        document.getElementById("lightbox").classList.remove("open");
    }
});

document.addEventListener("DOMContentLoaded", checkAuthAndLoad);

window.initReadMore = function() {
    const wrappers = document.querySelectorAll('.board-content-wrapper');
    wrappers.forEach(wrapper => {
        const content = wrapper.querySelector('.board-content');
        const card = wrapper.closest('.board-card');
        const actionArea = card ? card.querySelector('.read-more-action') : null;
        const btn = actionArea ? actionArea.querySelector('.read-more-btn') : null;
        
        if (!actionArea || !btn) return;
        
        const textSpan = btn.querySelector('.btn-text');
        const icon = btn.querySelector('.btn-icon');
        
        if (textSpan && textSpan.textContent === '접기') return;

        if (content.scrollHeight > 500) {
            wrapper.classList.add('collapsed');
            actionArea.style.display = 'flex';
            if (textSpan) textSpan.textContent = '더보기';
            if (icon) {
                icon.classList.remove('fa-angles-up');
                icon.classList.add('fa-angles-down');
            }
        } else {
            wrapper.classList.remove('collapsed');
            actionArea.style.display = 'none';
        }
    });
};

window.toggleReadMore = function(btn) {
    const card = btn.closest('.board-card');
    const wrapper = card ? card.querySelector('.board-content-wrapper') : null;
    if (!wrapper) return;
    
    const textSpan = btn.querySelector('.btn-text');
    const icon = btn.querySelector('.btn-icon');
    
    if (wrapper.classList.contains('collapsed')) {
        wrapper.classList.remove('collapsed');
        if (textSpan) textSpan.textContent = '접기';
        if (icon) {
            icon.classList.remove('fa-angles-down');
            icon.classList.add('fa-angles-up');
        }
    } else {
        wrapper.classList.add('collapsed');
        if (textSpan) textSpan.textContent = '더보기';
        if (icon) {
            icon.classList.remove('fa-angles-up');
            icon.classList.add('fa-angles-down');
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (window.initReadMore) window.initReadMore();
    }, 200);
});