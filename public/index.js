/**
 * Index Page Controller
 * 메인 대시보드 컴포넌트 렌더링 및 Fetch 체이닝
 */
document.addEventListener('DOMContentLoaded', async () => {
    renderSkeletons();

    // 스크롤 감지하여 GNB 헤더 스타일 전환 (100vh 스냅 스크롤러 감지)
    const layout = document.querySelector('.index-layout');
    const header = document.getElementById('global-header');
    if (layout && header) {
        layout.addEventListener('scroll', () => {
            if (layout.scrollTop > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

    // 각 위젯 로딩 프로세스를 완전히 격리하여 하나의 에러가 다른 영역을 오염시키는 일을 원천 차단합니다.
    try {
        await fetchMainDashboardData();
    } catch (err) {
        console.error("fetchMainDashboardData 실행 실패:", err);
    }

    try {
        await loadServerStatus();
    } catch (err) {
        console.error("loadServerStatus 실행 실패:", err);
    }

    try {
        initQuestTimeline();
    } catch (err) {
        console.error("initQuestTimeline 실행 실패:", err);
    }

    try {
        initJobRotation();
    } catch (err) {
        console.error("initJobRotation 실행 실패:", err);
    }
});

function renderSkeletons() {
    const statusContainer = document.getElementById('mini-server-status');
    if (statusContainer) {
        statusContainer.innerHTML = `
            <div class="mini-status-wrapper skeleton" style="width: 160px; height: 32px; border: 1px solid rgba(255, 255, 255, 0.05);"></div>
        `;
    }

    const postsContainer = document.getElementById('latest-posts');
    if (postsContainer) {
        postsContainer.innerHTML = '<li class="skeleton" style="height: 34px; margin-bottom: 8px; list-style: none;"></li>'.repeat(5);
    }

    const reviewsContainer = document.getElementById('recent-reviews-content');
    if (reviewsContainer) {
        reviewsContainer.innerHTML = '<div class="skeleton" style="height: 97px; margin-bottom: 10px;"></div>'.repeat(2);
    }
}

function renderDashboardErrorUI() {
    const bannerWrapper = document.getElementById('banner-wrapper');
    const heroSwiperEl = document.getElementById('hero-swiper');

    if (bannerWrapper) {
        bannerWrapper.innerHTML = `
            <div class="swiper-slide" style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; padding: 30px; text-align: center; background: linear-gradient(135deg, #1f1414 0%, #0f0707 100%); border: 1px dashed rgba(231, 76, 60, 0.3); border-radius: 0px; color: var(--text-muted); box-sizing: border-box;">
                <div style="font-size: 2rem; margin-bottom: 12px; color: #e74c3c;"><i class="ra ra-skull"></i></div>
                <div style="font-weight: 800; font-size: 1rem; color: #ff7675; margin-bottom: 6px; letter-spacing: 0.5px;">일시적인 접속 실패</div>
                <div style="font-size: 0.78rem; margin-bottom: 16px; opacity: 0.8; line-height: 1.4;">서버 혹은 네트워크 연결이 원활하지 않습니다.</div>
                <button onclick="retryDashboardLoad()" style="background: transparent; color: #ff7675; border: 1px solid #ff7675; padding: 6px 16px; border-radius: 0px; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 0 10px rgba(231, 76, 60, 0.15);" onmouseover="this.style.background='#ff7675'; this.style.color='#000'; this.style.boxShadow='0 0 15px rgba(231, 76, 60, 0.4)';" onmouseout="this.style.background='transparent'; this.style.color='#ff7675'; this.style.boxShadow='0 0 10px rgba(231, 76, 60, 0.15)';">다시 시도</button>
            </div>
        `;
        
        if (typeof Swiper !== 'undefined') {
            try {
                new Swiper('#hero-swiper', {
                    loop: false,
                    autoplay: false,
                    pagination: { el: '.swiper-pagination', clickable: true },
                    navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }
                });
            } catch (e) {
                console.error("Error initializing Swiper in error state:", e);
            }
        } else {
            console.warn("Swiper가 정의되지 않아 오류 UI 폴백 모드로 렌더링합니다.");
            if (heroSwiperEl) {
                heroSwiperEl.classList.add('swiper-fallback-active');
            }
        }
    }

    const postsList = document.getElementById('latest-posts');
    if (postsList) {
        postsList.innerHTML = `
            <li class="widget-list-item" style="cursor: default; background: rgba(231, 76, 60, 0.05); border: 1px dashed rgba(231, 76, 60, 0.15); justify-content: center; padding: 12px; border-radius: 0px;">
                <span style="color: #ff7675; font-size: 0.8rem; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                     게시글을 불러오지 못했습니다.
                </span>
            </li>
        `;
    }

    const reviewsContainer = document.getElementById('recent-reviews-content');
    if (reviewsContainer) {
        reviewsContainer.innerHTML = `
            <div style="background: rgba(231, 76, 60, 0.05); border: 1px dashed rgba(231, 76, 60, 0.15); padding: 20px; border-radius: 0px; text-align: center; color: #ff7675; font-size: 0.8rem; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                리뷰를 로드하는 데 실패했습니다.
            </div>
        `;
    }
}

window.retryDashboardLoad = function() {
    renderSkeletons();
    fetchMainDashboardData()
        .catch(err => console.error("Dashboard Retry Load Error:", err));
};



function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '')
        .replace(/#{1,6}\s?/g, '')
        .replace(/>\s?/g, '')
        .replace(/`{1,3}/g, '')
        .replace(/\n/g, ' ')
        .trim();
}

function getTagThemeForIndex(tag, type) {
    if (type === 'event') return { color: '#e056fd', bg: 'rgba(224, 86, 253, 0.1)' };
    switch(tag) {
        case '업데이트': return { color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.1)' };
        case '서버 상태 공지': return { color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.1)' };
        case '직업 공지': return { color: '#f1c40f', bg: 'rgba(241, 196, 15, 0.1)' };
        case '시스템 공지': return { color: '#9b59b6', bg: 'rgba(155, 89, 182, 0.1)' };
        case '일반 공지': default: return { color: '#3498db', bg: 'rgba(52, 152, 219, 0.1)' };
    }
}

// ---------------------------------------------------------
// 위젯 로드 함수
// ---------------------------------------------------------

async function fetchMainDashboardData() {
    try {
        const response = await fetch('/api/v1/dashboard/main');
        if (!response.ok) throw new Error('Dashboard data fetch failed');

        const data = await response.json();

        if (document.getElementById('eventPopupModal')) {
            handleEventPopup(data.popup);
        }

        renderBanners(data.banners);
        renderLatestPosts(data.posts);
        renderRecentReviews(data.reviews);
    } catch (e) {
        console.error("fetchMainDashboardData 실패:", e);
        renderDashboardErrorUI();
    }
}

function renderBanners(banners) {
    const wrapper = document.getElementById('banner-wrapper');
    const heroSwiperEl = document.getElementById('hero-swiper');

    if (!wrapper) return;

    if (!banners || banners.length === 0) {
        wrapper.innerHTML = '<div class="swiper-slide" style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--text-muted); background:var(--bg-surface);">표시할 배너가 없습니다.</div>';
        return;
    }

    wrapper.innerHTML = banners.map(b => {
        const bgStyle = `display:block; width:100%; height:100%; background-image:url('${escapeHTML(b.image_url)}'); background-size:cover; background-position:center;`;
        if (b.link_url && b.link_url.trim() !== '') {
            return `<div class="swiper-slide"><a href="${escapeHTML(b.link_url)}" target="_blank" rel="noopener noreferrer" style="${bgStyle} text-decoration:none;"></a></div>`;
        } else {
            return `<div class="swiper-slide"><div style="${bgStyle}"></div></div>`;
        }
    }).join('');

    if (typeof Swiper !== 'undefined') {
        try {
            new Swiper('#hero-swiper', {
                loop: false,
                autoplay: { delay: 5000, disableOnInteraction: false },
                pagination: { el: '.swiper-pagination', clickable: true },
                navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                effect: 'fade', fadeEffect: { crossFade: true }
            });
        } catch (e) {
            console.error("Swiper 초기화 오류:", e);
            if (heroSwiperEl) {
                heroSwiperEl.classList.add('swiper-fallback-active');
            }
        }
    } else {
        console.warn("Swiper 라이브러리가 로드되지 않았습니다. 폴백 정적 모드로 구동합니다.");
        if (heroSwiperEl) {
            heroSwiperEl.classList.add('swiper-fallback-active');
        }
    }
}

async function loadServerStatus() {
    try {
        const response = await fetch('/api/v1/server/status');
        const data = await response.json();

        const container = document.getElementById('mini-server-status');
        if (!container) return;

        // 세션 정보 확인하여 STAFF 권한 획득
        let isStaff = false;
        try {
            const authRes = await fetch('/api/v1/auth/me');
            const authData = await authRes.json();
            if (authData.is_logged_in && authData.server_role === "STAFF") {
                isStaff = true;
            }
        } catch (authErr) {
            console.error("인증 상태 조회 실패:", authErr);
        }

        let statusHtml = '';
        if (data.online) {
            statusHtml = `
                <div class="mini-status-wrapper online">
                    <span class="status-indicator">
                        <span class="pulse"></span>
                    </span>
                    <span class="status-text space-mono">SERVER ONLINE</span>
                    <span class="status-players space-mono">${data.players.online} / ${data.players.max} PLAYERS</span>
                </div>
            `;
        } else {
            statusHtml = `
                <div class="mini-status-wrapper offline">
                    <span class="status-indicator"></span>
                    <span class="status-text space-mono">SERVER OFFLINE</span>
                    ${isStaff ? `<button id="btn-server-refresh" class="btn-server-refresh" style="margin-left: 10px; padding: 2px 8px; font-size: 0.75rem; cursor: pointer; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-sync-alt"></i> 새로고침</button>` : ''}
                </div>
            `;
        }

        container.innerHTML = statusHtml;

        // 새로고침 버튼 이벤트 바인딩
        const refreshBtn = document.getElementById('btn-server-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
                try {
                    const res = await fetch('/api/v1/server/refresh', { method: 'POST' });
                    if (res.status === 200) {
                        await loadServerStatus();
                    } else {
                        const errData = await res.json();
                        alert(errData.detail || "새로고침 실패");
                        await loadServerStatus();
                    }
                } catch (err) {
                    console.error("새로고침 API 호출 에러:", err);
                    alert("서버 통신 실패");
                    await loadServerStatus();
                }
            };
        }
    } catch (e) {
        console.error("서버 상태 로드 실패:", e);
        const container = document.getElementById('mini-server-status');
        if (container) {
            container.innerHTML = `
                <div class="mini-status-wrapper offline">
                    <span class="status-indicator"></span>
                    <span class="status-text space-mono">STATUS ERROR</span>
                </div>
            `;
        }
    }
}

function renderLatestPosts(posts) {
    const listEl = document.getElementById('latest-posts');
    if (!posts || posts.length === 0) {
        listEl.innerHTML = '<li class="placeholder">최근 업데이트가 없습니다.</li>';
        return;
    }

    listEl.innerHTML = posts.map(post => {
        const dateStr = new Date(post.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        const tagText = post.tag || (post.type === 'event' ? '이벤트' : '공지');
        const tagTheme = getTagThemeForIndex(post.tag, post.type);
        let rawContent = post.content ? stripMarkdown(post.content.replace(/@[\u200B\s]*(everyone|here)/g, '').replace(/<@[!&]?\d+>/g, '')) : '';
        let displayTitle = post.title || (rawContent.length > 50 ? rawContent.substring(0, 50) : (rawContent || '제목 없음'));

        return `
            <li class="widget-list-item" onclick="location.href='/${post.type}?id=${post.notice_id}'">
                <span style="color: ${tagTheme.color}; background: ${tagTheme.bg}; border: 1px solid ${tagTheme.color}40; padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; margin-right: 8px; flex-shrink: 0;">${escapeHTML(tagText)}</span>
                <span class="item-title" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem; transition: color 0.2s;">${escapeHTML(displayTitle)}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 10px; flex-shrink: 0;">${dateStr}</span>
            </li>
        `;
    }).join('');
}

function renderRecentReviews(reviews) {
    const container = document.getElementById('recent-reviews-content');
    if (!container) return;
    if (!reviews || reviews.length === 0) {
        container.innerHTML = '<div class="placeholder">최근 평가가 없습니다.</div>';
        return;
    }

    container.innerHTML = reviews.map(r => {
        const rating = Math.min(5, Math.max(0, parseInt(r.rating) || 0));
        const filledGems = '<i class="fas fa-gem rating-gem-filled"></i>'.repeat(rating);
        const emptyGems = '<i class="fas fa-gem rating-gem-empty"></i>'.repeat(5 - rating);

        return `
            <div class="review-card">
                <div class="review-meta">
                    <span class="review-job-name space-mono">${escapeHTML(r.job_name)}</span>
                    <span class="review-rating">${filledGems}${emptyGems}</span>
                </div>
                <div class="review-comment">"${escapeHTML(r.comment)}"</div>
                <div class="review-author">- ${escapeHTML(r.nickname)}</div>
            </div>
        `;
    }).join('');
}

function handleEventPopup(popupData) {
    const hideUntil = localStorage.getItem('hidePopupUntil');
    if (hideUntil && Date.now() < parseInt(hideUntil)) return;

    if (popupData && popupData.notice_id) {
        try {
            renderPopup(popupData);
        } catch (err) {
            console.error("이벤트 팝업 렌더링 에러:", err);
        }
    }
}

function renderPopup(data) {
    if (!data || !data.notice_id) return;

    const modal = document.getElementById('eventPopupModal');
    const imgContainer = document.getElementById('popupImageContainer');
    const titleEl = document.getElementById('popupTitle');

    if (!modal || !imgContainer || !titleEl) {
        console.warn("팝업 모달 엘리먼트 중 일부가 누락되었습니다. 렌더링을 스킵합니다.");
        return;
    }

    titleEl.textContent = data.title || '진행 중인 이벤트';

    let images = data.image_urls || [];
    if (images.length === 0) return;

    let imgHtml = '';
    if (images.length > 1) {
        imgHtml = `
            <div id="popupSlider" style="display: flex; transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); width: ${images.length * 100}%;">
                ${images.map(url => `
                    <div style="width: ${100 / images.length}%; flex-shrink: 0; cursor: pointer;" onclick="location.href='/event?id=${data.notice_id}'">
                        <img src="${escapeHTML(url)}" style="width: 100%; height: auto; display: block; max-height: 400px; object-fit: contain; background: rgba(11, 12, 26, 0.8);">
                    </div>
                `).join('')}
            </div>
            <button onclick="movePopupSlide(-1)" class="popup-nav-btn" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(11, 12, 26, 0.6); backdrop-filter: blur(4px); color: var(--text-main); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; transition: all 0.2s ease;">&lt;</button>
            <button onclick="movePopupSlide(1)" class="popup-nav-btn" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(11, 12, 26, 0.6); backdrop-filter: blur(4px); color: var(--text-main); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; transition: all 0.2s ease;">&gt;</button>
        `;
    } else {
        // 단일 이미지 렌더링
        imgHtml = `<div style="cursor: pointer;" onclick="location.href='/event?id=${data.notice_id}'">
            <img src="${escapeHTML(images[0])}" style="width: 100%; height: auto; display: block; max-height: 400px; object-fit: contain; background: rgba(11, 12, 26, 0.8);">
        </div>`;
    }

    imgContainer.innerHTML = imgHtml;
    imgContainer.dataset.currentIndex = 0;
    imgContainer.dataset.maxIndex = images.length - 1;

    modal.classList.add('open');
}

window.movePopupSlide = function(dir) {
    const container = document.getElementById('popupImageContainer');
    const slider = document.getElementById('popupSlider');
    if (!slider) return;

    let currentIndex = parseInt(container.dataset.currentIndex);
    const maxIndex = parseInt(container.dataset.maxIndex);

    currentIndex += dir;
    if (currentIndex < 0) currentIndex = maxIndex;
    if (currentIndex > maxIndex) currentIndex = 0;

    container.dataset.currentIndex = currentIndex;
    slider.style.transform = `translateX(-${currentIndex * (100 / (maxIndex + 1))}%)`;
};

window.closePopupModal = function() {
    document.getElementById('eventPopupModal').classList.remove('open');
};

window.closePopupForToday = function() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    localStorage.setItem('hidePopupUntil', midnight.getTime());
    closePopupModal();
};

/**
 * 퀘스트 저널 타임라인 인터랙션 초기화
 */
function initQuestTimeline() {
    const container = document.querySelector('.timeline-container');
    const steps = document.querySelectorAll('.timeline-step');
    const trackPath = document.getElementById('track-path');
    const trackActivePath = document.getElementById('track-active-path');

    if (!container || steps.length === 0 || !trackPath || !trackActivePath) return;

    let pathLength = 1000;
    let segmentLengths = [0, 0, 0, 0];

    // 동적으로 SVG Path를 업데이트하는 함수
    function updateTimelinePath() {
        // 모바일(768px 이하)일 때는 동작을 완전히 스킵하고 path를 클리어
        if (window.innerWidth <= 768) {
            trackPath.setAttribute('d', '');
            trackActivePath.setAttribute('d', '');
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const points = [];

        // 각 단계 카드의 중심점을 container 기준 좌표로 구함
        steps.forEach((step) => {
            const card = step.querySelector('.step-card');
            if (!card) return;
            const cardRect = card.getBoundingClientRect();
            
            const x = cardRect.left - containerRect.left + cardRect.width / 2;
            const y = cardRect.top - containerRect.top + cardRect.height / 2;
            points.push({ x, y });
        });

        // 4개의 중심점이 정상적으로 구해졌는지 검증
        if (points.length < 4) return;

        const P1 = points[0];
        const P2 = points[1];
        const P3 = points[2];
        const P4 = points[3];

        // Z/S자 대각선 S-Curve 수식 조합 (비대칭 최적화 및 곡선화 보정)
        // P1 ➔ P2 (수평 우측 - 아래로 완만하게 굽어지는 아크 추가)
        const dx1 = P2.x - P1.x;
        const C1x = P1.x + dx1 * 0.35;
        const C1y = P1.y + 40;  /* 아래로 40px 처지는 아크 */
        const C2x = P2.x - dx1 * 0.35;
        const C2y = P2.y + 40;

        // P2 ➔ P3 (대각선 좌하향 횡단 - 부드러운 탄젠트 S자 곡선화)
        const dx2 = P2.x - P3.x;
        const dy2 = P3.y - P2.y;
        const C3x = P2.x - dx2 * 0.6;  /* X축 텐션 증폭 */
        const C3y = P2.y;              /* P2에서 수평으로 탄젠트 탈출 */
        const C4x = P3.x + dx2 * 0.6;
        const C4y = P3.y;              /* P3로 수평으로 탄젠트 진입 */

        // P3 ➔ P4 (수평 우측 - 위로 완만하게 솟아오르는 아크 추가)
        const dx3 = P4.x - P3.x;
        const C5x = P3.x + dx3 * 0.35;
        const C5y = P3.y - 40;  /* 위로 40px 솟아오르는 아크 */
        const C6x = P4.x - dx3 * 0.35;
        const C6y = P4.y - 40;

        // 3차 베지어 곡선(Cubic Bezier) 조합
        const d = `M ${P1.x} ${P1.y} ` +
                  `C ${C1x} ${C1y}, ${C2x} ${C2y}, ${P2.x} ${P2.y} ` +
                  `C ${C3x} ${C3y}, ${C4x} ${C4y}, ${P3.x} ${P3.y} ` +
                  `C ${C5x} ${C5y}, ${C6x} ${C6y}, ${P4.x} ${P4.y}`;

        trackPath.setAttribute('d', d);
        trackActivePath.setAttribute('d', d);

        // 임시 SVG 엘리먼트를 활용해 구간별 정확한 곡선 물리 길이 측정 (mismatch 방어)
        function getSegmentLength(segmentD) {
            try {
                const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                tempPath.setAttribute('d', segmentD);
                return tempPath.getTotalLength() || 0;
            } catch (e) {
                return 0;
            }
        }

        const len1 = getSegmentLength(`M ${P1.x} ${P1.y} C ${C1x} ${C1y}, ${C2x} ${C2y}, ${P2.x} ${P2.y}`);
        const len2 = getSegmentLength(`M ${P2.x} ${P2.y} C ${C3x} ${C3y}, ${C4x} ${C4y}, ${P3.x} ${P3.y}`);
        const len3 = getSegmentLength(`M ${P3.x} ${P3.y} C ${C5x} ${C5y}, ${C6x} ${C6y}, ${P4.x} ${P4.y}`);

        pathLength = len1 + len2 + len3;
        if (!pathLength || isNaN(pathLength)) pathLength = 1200;

        // 엇갈린 거점 흐름에 맞게 각 단계별 누적 실질 길이 저장
        segmentLengths = [
            0,
            len1,
            len1 + len2,
            pathLength
        ];

        trackActivePath.style.strokeDasharray = pathLength;
        trackActivePath.style.strokeDashoffset = pathLength;
    }

    // 초기 및 resize 이벤트 연결
    updateTimelinePath();
    window.addEventListener('resize', updateTimelinePath);

    // 호버 이벤트 바인딩
    steps.forEach((step, index) => {
        step.addEventListener('mouseenter', () => {
            if (window.innerWidth <= 768) return; // 모바일 스킵
            
            // 호버된 스텝에 비례하여 게이지를 채움 (정밀 보정된 누적 실질 길이 반영)
            const activeLength = segmentLengths[index];
            const newOffset = pathLength - activeLength;
            trackActivePath.style.strokeDashoffset = newOffset;

            // 해당 단계 이하 카드 활성화 효과 부여
            for (let i = 0; i <= index; i++) {
                const targetCard = steps[i].querySelector('.step-card');
                if (targetCard) targetCard.classList.add('glow-active');
            }
        });

        step.addEventListener('mouseleave', () => {
            if (window.innerWidth <= 768) return;
            
            trackActivePath.style.strokeDashoffset = pathLength;

            steps.forEach(s => {
                const targetCard = s.querySelector('.step-card');
                if (targetCard) targetCard.classList.remove('glow-active');
            });
        });
    });
}

// ---------------------------------------------------------
// 시즌 직업 및 대사 동적 순환 전환 시스템 ( Mock JSON 로컬 데이터 )
// ---------------------------------------------------------
const SEASON_JOBS = [
    {
        subtitle: "게이트의 유일한 생존자. 반",
        narrative: "기억해라. 너희가 남긴 이 오류가, 결국 너희의 심장을 꿰뚫을 테니까."
    },
    {
        subtitle: "전장을 찢는 폭풍, 사토의 가르침. 즈윌링",
        narrative: "내가 유일하게 인정한 검사, 그분의 이름에 먹칠할 순 없지."
    },
    {
        subtitle: "절대자의 핏줄, 환생한 도깨비 수호신. 신",
        narrative: "도깨비가 장난기를 거두는 순간이 언제인지 보여주지. 똑똑히 봐라."
    },
    {
        subtitle: "뇌전을 두른 강철 주먹, 제우스의 마지막 투신. 제리",
        narrative: "제우스의 마지막 뇌전이다. 이 지옥 같은 게이트와 함께 잿더미로 변해라!"
    },
    {
        subtitle: "사토 가문의 의지를 이은 팀 제트의 리더. 사토 신지",
        narrative: "게이트 Z 링크 완료. 지금부터 사냥을 시작한다."
    }
];

let currentJobIndex = 0;
let jobRotationInterval = null;
const ROTATION_DELAY = 6000;
let shuffledJobs = [];

// Fisher-Yates 셔플 알고리즘
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 셔플된 새 플레이리스트 세트 충전
function refreshShuffledJobs() {
    const lastJob = shuffledJobs[shuffledJobs.length - 1];
    let newSet = shuffleArray(SEASON_JOBS);
    
    // 엣지 케이스 방어: 이전 세트의 마지막 직업과 새 세트의 첫 직업이 같을 경우
    if (lastJob && newSet[0].subtitle === lastJob.subtitle && newSet.length > 1) {
        // 첫 번째 직업과 두 번째 직업의 위치를 바꿈
        [newSet[0], newSet[1]] = [newSet[1], newSet[0]];
    }
    
    shuffledJobs = newSet;
    currentJobIndex = 0;
}

function initJobRotation() {
    const subtitleEl = document.querySelector('.hero-subtitle');
    const narrativeEl = document.querySelector('.narrative-p');
    
    if (!subtitleEl || !narrativeEl) return;
    
    // 셔플된 배열 초기 설정
    refreshShuffledJobs();
    
    // 초기 타이머 작동
    startJobRotation();
    
    // Page Visibility Tracker 연동 (리소스 해제/재구동)
    initVisibilityTracker();
}

function startJobRotation() {
    const subtitleEl = document.querySelector('.hero-subtitle');
    const narrativeEl = document.querySelector('.narrative-p');
    
    if (!subtitleEl || !narrativeEl) return;
    if (jobRotationInterval) return;
    
    jobRotationInterval = setInterval(() => {
        // 페이드 아웃
        subtitleEl.classList.add('fade-out');
        narrativeEl.classList.add('fade-out');
        
        setTimeout(() => {
            currentJobIndex++;
            
            // 모든 직업이 한 바퀴 다 돌았다면 새 셔플 세트 준비
            if (currentJobIndex >= shuffledJobs.length) {
                refreshShuffledJobs();
            }
            
            const nextJob = shuffledJobs[currentJobIndex];
            
            subtitleEl.textContent = nextJob.subtitle;
            narrativeEl.textContent = `"${nextJob.narrative}"`;
            
            // 페이드 인
            subtitleEl.classList.remove('fade-out');
            narrativeEl.classList.remove('fade-out');
        }, 400); // transition 지속 시간(0.4초)에 최적화
    }, ROTATION_DELAY);
}

function stopJobRotation() {
    if (jobRotationInterval) {
        clearInterval(jobRotationInterval);
        jobRotationInterval = null;
    }
}

function initVisibilityTracker() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopJobRotation();
        } else {
            stopJobRotation();
            startJobRotation();
        }
    });
}