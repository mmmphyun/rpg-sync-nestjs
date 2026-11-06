if (typeof escapeHTML === 'undefined') {
    window.escapeHTML = function(str) {
        if (!str) return "";
        return String(str).replace(/[&<>'"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[m]));
    };
}

/**
 * View Controller & Event Listeners
 * API 연동 기반 DOM 조작 및 사용자 인터랙션 처리
 */

// =============================================
//  Constants & Utility Functions
// =============================================
const RANGE_CLS = { "근거리": "t-melee", "원거리": "t-ranged", "근거리, 원거리": "t-hybrid", "정보 없음": "t-unknown" };
const POS_CLS   = { "탱": "t-tank", "물리": "t-phys", "마법": "t-magic", "혼합": "t-hybrid-dmg", "힐": "t-heal", "유틸": "t-util", "정보 없음": "t-unknown" };
const RES_CLS   = { "기력": "t-ki", "마나": "t-mana", "체력": "t-hp", "에너지": "t-en", "정보 없음": "t-unknown" };
const POS_BG    = { "탱": "bg-tank", "딜": "bg-deal", "힐": "bg-heal", "유틸": "bg-util", "정보 없음": "bg-unknown" };
const WEAPON_ICONS = {
    "대검": "ra ra-relic-blade",
    "카타나": "ra ra-dripping-sword",
    "검": "ra ra-sword",
    "단검": "ra ra-bone-knife",
    "활": "ra ra-supersonic-arrow",
    "석궁": "ra ra-crossbow",
    "지팡이": "ra ra-crystal-wand",
    "도끼": "ra ra-battered-axe",
    "망치": "ra ra-flat-hammer",
    "부채": "ra ra-feather-wing",
    "건틀릿": "ra ra-blaster",
    "저격총": "ra ra-rifle",
    "소총": "ra ra-bullets",
    "산탄총": "ra ra-shotgun-shell",
    "권총": "ra ra-revolver",
    "표창": "ra-shuriken",
    "창": "ra ra-spear-head",
    "방패": "ra ra-heavy-shield",
    "낫": "ra ra-scythe",
    "게임패드": "fa-solid fa-gamepad",
    "삼지창": "ra ra-trident",
    "사슬": "ra ra-chain",
    "닻": "ra ra-anchor",
    "없음": "ra ra-cancel"
};

function posTag(pos) {
    if (!pos) return "";
    return pos.split("/").map(p => {
        const cls = POS_CLS[p] || "t-unknown";
        return `<span class="mini-tag ${cls}">${p}</span>`;
    }).join("");
}

function posTagFull(pos) {
    if (!pos) return "";
    return pos.split("/").map(p => {
        const cls = POS_CLS[p] || "t-unknown";
        return `<span class="sidebar-tag ${cls}">${p}</span>`;
    }).join("");
}

function posBg(pos) {
    if (!pos) return "bg-unknown";
    const first = pos.split("/")[0];
    return POS_BG[first] || "bg-unknown";
}

function getInitials(name) {
    const clean = name.replace(/[«»()\s]/g, "");
    return clean.slice(0, 2);
}



function formatRangeDisplay(range) {
    if (range === "근거리, 원거리" || range === "근거리,원거리") {
        return "근/원거리";
    }
    return range;
}

function getWeaponIconClass(type) {
    return WEAPON_ICONS[type] || "ra ra-sword"; // 매핑 안 된 무기는 기본 검 아이콘
}

// =============================================
//  State & DOM References
// =============================================
let JOBS = [];
const app = document.getElementById("app");
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebarContent");

let currentSort = "range";
let activeFilters = {};
let selectedIdx = -1;

let currentJobReviewsPromise = null;
let currentUserNickname = null;

let currentSearchQuery = "";

// =============================================
//  Core Logic
// =============================================
function getFiltered() {
    return JOBS.filter(j => {
        if (currentSearchQuery) {
            const nameMatch = j.name.toLowerCase().includes(currentSearchQuery.toLowerCase());
            const searchNameMatch = j.searchName && j.searchName.toLowerCase().includes(currentSearchQuery.toLowerCase());

            if (!nameMatch && !searchNameMatch) return false;
        }
        for (const [key, val] of Object.entries(activeFilters)) {
            const v = j[key] || "정보 없음";
            if (key === "position" || key === "range") {
                if (!v.includes(val)) return false;
            } else {
                if (v !== val) return false;
            }
        }
        return true;
    });
}

function renderTile(job, idx) {
    const sel = idx === selectedIdx ? " selected" : "";

    const portrait = job.img
        ? `<img src="${job.img}" alt="${job.name}">`
        : getInitials(job.name);

    const lim = job.limit ? `<span class="mini-tag t-limit">1인</span>` : "";

    const hasPlayers = job.players && job.players.length > 0;
    const dot = hasPlayers ? `<div class="active-dot"></div>` : "";
    const tooltip = hasPlayers ? `<div class="player-tooltip">${job.players.map(p => escapeHTML(p)).join(", ")}</div>` : "";

    let typeClass = "";
    if (job.type === "영웅") typeClass = "type-hero";
    else if (job.type === "빌런") typeClass = "type-villain";

    return `<div class="champ-tile${sel}" data-idx="${idx}">
      <div class="champ-portrait ${posBg(job.position)} ${typeClass}">${portrait}${dot}</div>
      ${tooltip}
      <div class="champ-name">${job.name}</div>
      <div class="champ-mini-tags">
        <span class="mini-tag ${RANGE_CLS[job.range] || "t-unknown"}">${formatRangeDisplay(job.range)}</span>
        ${posTag(job.position)}
      </div>
      ${lim ? `<div class="champ-mini-tags">${lim}</div>` : ""}
    </div>`;
}

function renderGrid() {
    const jobs = getFiltered();
    jobs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    document.getElementById("jobCount").textContent = jobs.length + "개 직업";

    const groupOrders = {
        gate: null,
        range: ["근거리", "원거리", "근거리, 원거리", "정보 없음"],
        position: ["탱", "물리", "마법", "혼합", "힐", "유틸", "정보 없음"],
        resource: ["기력", "마나", "체력", "에너지", "정보 없음"],
    };

    const key = currentSort;
    let html = "";

    if (key === "gate") {
        const gateMap = new Map();
        jobs.forEach(j => {
            const gateKey = j.gate || "정보 없음";
            if (!gateMap.has(gateKey)) gateMap.set(gateKey, []);
            gateMap.get(gateKey).push(j);
        });

        const gates = [...gateMap.keys()].sort((a, b) => a.localeCompare(b, "ko"));

        gates.forEach(g => {
            html += `<div class="group-label">${g} (${gateMap.get(g).length})</div>`;
            html += `<div class="champ-grid">${gateMap.get(g).map(j => renderTile(j, JOBS.indexOf(j))).join("")}</div>`;
        });
    } else {
        const order = groupOrders[key];
        const groups = new Map();
        order.forEach(v => groups.set(v, []));

        jobs.forEach(j => {
            const v = j[key] || "정보 없음";
            if (key === "position") {
                v.split("/").forEach(p => {
                    if (!groups.has(p)) groups.set(p, []);
                    groups.get(p).push(j);
                });
            } else {
                if (!groups.has(v)) groups.set(v, []);
                groups.get(v).push(j);
            }
        });

        groups.forEach((list, groupKey) => {
            if (list.length === 0) return;
            html += `<div class="group-label">${groupKey} (${list.length})</div>`;
            html += `<div class="champ-grid">${list.map(j => renderTile(j, JOBS.indexOf(j))).join("")}</div>`;
        });
    }

    app.innerHTML = html;
}

let currentFormMap = {};
let currentWeaponIdx = 0;

function formatCommandToKbd(cmd) {
    if (!cmd) return '';
    if (cmd === '패시브') {
        return `<span class="passive-tag">[패시브]</span>`;
    }

    const commandMap = {
        'SHIFT': '⇧',
        '좌클릭': '<i class="fa-solid fa-mouse"></i><span style="font-size: 0.6rem; color: #ff7675; margin-left: 2px;">L</span>',
        '우클릭': '<i class="fa-solid fa-mouse"></i><span style="font-size: 0.6rem; color: #74b9ff; margin-left: 2px;">R</span>',
        '휠클릭': '<i class="fa-solid fa-mouse"></i><span style="font-size: 0.6rem; color: #55efc4; margin-left: 2px;">M</span>'
    };

    return cmd.split('+').map(part => {
        const p = part.trim().toUpperCase();
        const content = commandMap[p] || commandMap[part.trim()] || escapeHTML(part.trim());
        return `<kbd class="key-kbd">${content}</kbd>`;
    }).join('<span class="key-plus">+</span>');
}

function renderWeaponsSection(jobIdx, activeWeaponIdx) {
    const job = JOBS[jobIdx];
    const weapons = job.weapons || [];

    if (weapons.length === 0) {
        return `<div style="padding: 15px; color: var(--text-muted); text-align: center; background: var(--bg-widget-medium); border-radius: 6px; margin-top: 15px; border: 1px solid var(--border-color);">등록된 무기 및 스킬 정보가 없습니다.</div>`;
    }

    const activeWeapon = weapons[activeWeaponIdx];
    const skills = activeWeapon.skills || [];

    const availableForms = [...new Set(skills.map(s => s.form_name).filter(f => f && f.trim() !== ''))]
        .sort((a, b) => a === '기본' ? -1 : b === '기본' ? 1 : 0);

    if (availableForms.length > 0 && !currentFormMap[activeWeaponIdx]) {
        currentFormMap[activeWeaponIdx] = availableForms.includes('기본') ? '기본' : availableForms[0];
    }
    const currentForm = currentFormMap[activeWeaponIdx];

    // 무기 선택 탭 (가로 스크롤 가능)
    let tabsHtml = `<div class="weapon-tabs-container">`;
    weapons.forEach((w, wIdx) => {
        const isAct = wIdx === activeWeaponIdx;
        const iconCls = getWeaponIconClass(w.weapon_type);
        const hasForms = w.skills && w.skills.some(s => s.form_name && s.form_name.trim() !== '');

        const dotBadge = (hasForms && !isAct) ? `<div class="form-badge-dot"></div>` : '';

        const isSpecialForm = hasForms && currentForm !== '기본';
        const themeColor = isSpecialForm ? 'var(--accent-villain)' : 'var(--accent-hero)';

        const formIndicator = (hasForms && isAct)
            ? `<div class="weapon-form-indicator" style="color: ${themeColor}; text-shadow: 0 0 8px color-mix(in srgb, ${themeColor} 40%, transparent);"><i class="ra ra-cycle" style="color: ${themeColor};"></i> ${currentForm}</div>`
            : '';

        const activeClass = isAct ? (isSpecialForm ? 'active form-active' : 'active') : '';

        tabsHtml += `
            <div class="weapon-tab ${activeClass}" onclick="changeWeapon(${jobIdx}, ${wIdx})">
                ${dotBadge}
                <i class="${iconCls} main-icon"></i>
                <span class="weapon-name-text">${escapeHTML(w.weapon_name)}</span>
                ${formIndicator}
            </div>
        `;
    });
    tabsHtml += `</div>`;

    // 스킬 필터링
    const fixedSkills = skills.filter(s => s.command_key === '패시브' || !s.form_name || s.form_name.trim() === '' || s.form_name === '공통');
    const formSkills = skills.filter(s => s.command_key !== '패시브' && s.form_name && s.form_name === currentForm && s.form_name !== '공통');

    // 커맨드 우선순위 가중치 반환 함수
    const getCommandWeight = (cmd) => {
        if (!cmd) return 999;
        const normalizedCmd = cmd.replace(/\s+/g, '').toUpperCase();

        const weights = {
            '패시브': 1,
            '좌클릭': 10,
            '우클릭': 20,
            'F': 30,
            'SHIFT+좌클릭': 40,
            'SHIFT+우클릭': 50,
            'SHIFT+F': 60
        };
        return weights[normalizedCmd] || 999;
    };

    fixedSkills.sort((a, b) => getCommandWeight(a.command_key) - getCommandWeight(b.command_key));
    formSkills.sort((a, b) => getCommandWeight(a.command_key) - getCommandWeight(b.command_key));

    // 스킬 카드 렌더링 (공간 압축형)
    const renderSkillCard = (s) => `
        <div class="skill-card">
            <div class="skill-header-top">
                <strong class="skill-title">
                    <span class="cmd-wrapper">${formatCommandToKbd(s.command_key)}</span>
                    <span class="skill-name-text" title="${escapeHTML(s.skill_name)}">${escapeHTML(s.skill_name)}</span>
                </strong>
            </div>
            <div class="skill-meta-row">
                <span title="쿨타임"><i class="fa-regular fa-clock"></i> ${escapeHTML(s.cooldown || '-')}</span>
                <span title="소모값" style="margin-left: 8px;"><i class="fa-solid fa-droplet" style="color: #3498db;"></i> ${escapeHTML(s.cost_value || '-')}</span>
            </div>
            <div class="skill-desc inner-scroll">${escapeHTML(s.description)}</div>
            <div class="skill-footer">
                <span>🗡 <span class="coef">${escapeHTML(s.coefficient || '-')}</span></span>
                ${s.is_mobility === 'Y' ? `<span class="mobility-tag">🏃 이동기</span>` : ''}
            </div>
        </div>
    `;

    let skillsHtml = `<div class="skills-wrapper">`;

    if (fixedSkills.length > 0) {
        skillsHtml += `<h4 class="skill-section-title">패시브 & 공통 스킬</h4>`;
        skillsHtml += `<div class="skill-grid">`;
        fixedSkills.forEach(s => { skillsHtml += renderSkillCard(s); });
        skillsHtml += `</div>`;
    }

    if (availableForms.length > 0) {
        const isSpecialForm = currentForm !== '기본';
        const themeColor = isSpecialForm ? 'var(--accent-villain)' : 'var(--accent-hero)';

        skillsHtml += `<h4 class="skill-section-title type-form">
            <span class="form-name" style="color: ${themeColor}; text-shadow: 0 0 8px color-mix(in srgb, ${themeColor} 40%, transparent);">
                [${currentForm}]
            </span> 액티브 스킬
        </h4>`;

        if (formSkills.length > 0) {
            skillsHtml += `<div class="skill-grid">`;
            formSkills.forEach(s => { skillsHtml += renderSkillCard(s); });
            skillsHtml += `</div>`;
        } else {
            skillsHtml += `<div class="empty-msg">현재 폼에 배정된 스킬이 없습니다.</div>`;
        }
    } else if (fixedSkills.length === 0) {
        skillsHtml += `<div class="empty-msg">스킬이 등록되지 않았습니다.</div>`;
    }

    skillsHtml += `</div>`;

    return tabsHtml + skillsHtml;
}

window.changeWeapon = function(jobIdx, weaponIdx) {
    const container = document.getElementById("weaponsAndSkillsContainer");
    if (!container) return;

    const job = JOBS[jobIdx];
    const activeWeapon = job.weapons[weaponIdx];
    const availableForms = [...new Set((activeWeapon.skills || []).map(s => s.form_name).filter(f => f && f.trim() !== ''))];

    const isAlreadyActive = (currentWeaponIdx === weaponIdx);

    if (isAlreadyActive && availableForms.length > 1) {
        const currentForm = currentFormMap[weaponIdx];
        let nextFormIndex = availableForms.indexOf(currentForm) + 1;
        if (nextFormIndex >= availableForms.length) nextFormIndex = 0;
        currentFormMap[weaponIdx] = availableForms[nextFormIndex];
    } else {
        currentWeaponIdx = weaponIdx;
        if (!currentFormMap[weaponIdx] && availableForms.length > 0) {
            currentFormMap[weaponIdx] = availableForms[0];
        }
    }

    container.innerHTML = renderWeaponsSection(jobIdx, weaponIdx);
};

window.changeGalleryImage = function(direction) {
    const imgEl = document.getElementById('sidebar-main-img');
    const photos = JSON.parse(imgEl.dataset.photos);
    if (!photos || photos.length === 0) return;

    let currentIndex = parseInt(imgEl.dataset.index);
    currentIndex += direction;

    if (currentIndex >= photos.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = photos.length - 1;

    imgEl.src = photos[currentIndex];
    imgEl.dataset.index = currentIndex;

    const dots = document.querySelectorAll('.gallery-dot');
    dots.forEach((dot, idx) => {
        if (idx === currentIndex) dot.classList.add('active');
        else dot.classList.remove('active');
    });
};

window.togglePatchNotes = function() {
    const notesContainer = document.getElementById('patchNotesContainer');
    const toggleIcon = document.getElementById('patchToggleIcon');
    if (notesContainer.style.display === 'none') {
        notesContainer.style.display = 'block';
        toggleIcon.textContent = '▲';
    } else {
        notesContainer.style.display = 'none';
        toggleIcon.textContent = '▼';
    }
};

function openSidebar(idx) {
    const job = JOBS[idx];
    selectedIdx = idx;
    currentFormMap = {};
    currentWeaponIdx = 0;
    renderGrid();

    let galleryImages = [];
    if (job.img) galleryImages.push(job.img);
    if (job.photos && job.photos.length > 0) galleryImages = galleryImages.concat(job.photos);

    let portraitHtml = "";
    if (galleryImages.length > 0) {
        const photosJson = escapeHTML(JSON.stringify(galleryImages));
        let dotsHtml = galleryImages.length > 1 ? `<div class="gallery-indicators">${galleryImages.map((_, i) => `<span class="gallery-dot ${i===0?'active':''}"></span>`).join('')}</div>` : '';
        let navHtml = galleryImages.length > 1 ? `
            <button class="gallery-nav prev" onclick="changeGalleryImage(-1)">&#10094;</button>
            <button class="gallery-nav next" onclick="changeGalleryImage(1)">&#10095;</button>
        ` : '';

        portraitHtml = `
            <div class="sidebar-portrait-wrapper">
                <img id="sidebar-main-img" src="${galleryImages[0]}" data-photos='${photosJson}' data-index="0" alt="${job.name}" onclick="openLightbox(this.src)">
                ${navHtml}
                ${dotsHtml}
            </div>
        `;
    } else {
        portraitHtml = `<div class="sidebar-portrait-fallback">${getInitials(job.name)}</div>`;
    }

    const formattedDesc = job.desc ? job.desc.replace(/\n/g, '<br>') : "설명이 없습니다.";
    const reqCondition = (job.req_condition && job.req_condition !== "정보 없음")
        ? `<div class="req-condition">[ 조건: ${job.req_condition} ]</div>` : "";

    let patchesHtml = "";
    if (job.patches && job.patches.length > 0) {
        patchesHtml = `
            <div class="sidebar-patches-wrapper">
                <div class="patch-header" onclick="togglePatchNotes()">
                    <h4>패치노트 (${job.patches.length})</h4>
                    <span id="patchToggleIcon">▼</span>
                </div>
                <div id="patchNotesContainer" style="display: none;">
                    ${job.patches.map(p => `
                        <div class="patch-entry">
                            <div class="patch-date">${p.date}</div>
                            <div class="patch-notes">${p.notes.replace(/\n/g, "<br>")}</div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    sidebarContent.innerHTML = `
      <button class="sidebar-close" onclick="closeSidebar()">&times;</button>

      <div class="slideover-layout">
          <!-- 좌측 패널: 정보 및 미디어 (35%) -->
          <div class="slideover-left inner-scroll">
              <div class="sidebar-profile-header">
                  ${portraitHtml}
                  <div class="sidebar-info-summary">
                      <div class="sidebar-name">${job.name}</div>
                      <div class="sidebar-gate">${job.gate}${job.group && job.group !== "정보 없음" ? ` · ${job.group}` : ""}</div>

                      <div class="sidebar-review-summary">
                        <span id="sideAvgRating" class="rating-text">평점 로딩 중...</span>
                        <button onclick="openReviewModal(${job.job_id}, '${job.name}')" class="review-btn">평가</button>
                      </div>

                      <div class="sidebar-tags">
                        <span class="sidebar-tag ${RANGE_CLS[job.range] || "t-unknown"}">${formatRangeDisplay(job.range)}</span>
                        ${posTagFull(job.position)}
                        <span class="sidebar-tag ${RES_CLS[job.resource] || "t-unknown"}">${job.resource}</span>
                        ${job.limit ? `<span class="sidebar-tag t-limit">1인 제한</span>` : ""}
                      </div>
                  </div>
              </div>

              <div class="sidebar-desc">${formattedDesc}${reqCondition}</div>
              ${patchesHtml}
          </div>

          <!-- 우측 패널: 전투 시스템 (65%) -->
          <div class="slideover-right inner-scroll">
              <div id="weaponsAndSkillsContainer">
                  ${renderWeaponsSection(idx, 0)}
              </div>
          </div>
      </div>
    `;

    currentJobReviewsPromise = fetch(`/api/v1/jobs/${job.job_id}/reviews`).then(res => res.json());
    currentJobReviewsPromise.then(data => {
        document.getElementById('sideAvgRating').textContent = `★ ${data.avg_rating}`;
    }).catch(e => {
        document.getElementById('sideAvgRating').textContent = `평가 없음`;
    });

    setTimeout(() => {
        sidebar.classList.add("open");
        if (window.innerWidth <= 1024) {
            document.body.style.overflow = 'hidden';
        }
    }, 10);
}

function closeSidebar() {
    sidebar.classList.remove("open");
    document.body.style.overflow = '';
    selectedIdx = -1;
    renderGrid();
}

function openLightbox(src) {
    const lb = document.getElementById("lightbox");
    lb.querySelector("img").src = src;
    lb.classList.add("open");
}

// =============================================
//  Review System Logic
// =============================================

/**
 * 리뷰 모달 열기 및 데이터 로드
 */
async function openReviewModal(jobId, jobName) {
    const modal = document.getElementById('reviewModal');
    const listContainer = document.getElementById('reviewList');
    const form = document.getElementById('reviewForm');
    const blocker = document.getElementById('reviewAuthBlocker');

    document.getElementById('reviewModalTitle').textContent = `${jobName} 한줄평`;
    modal.dataset.jobId = jobId;
    modal.classList.add('open');

    listContainer.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">리뷰를 불러오는 중입니다...</div>';

    // 1. 로그인 상태 확인 (작성 폼 제어)
    try {
        const authRes = await fetch('/api/v1/auth/me');
        const auth = await authRes.json();

        if (auth.is_logged_in) {
            currentUserNickname = auth.nickname;
            blocker.style.display = 'none';
            form.style.display = 'flex';
        } else {
            currentUserNickname = null;
            blocker.style.display = 'block';
            form.style.display = 'none';
        }
    } catch (e) { console.error("Auth check failed", e); }

    // 2. 리뷰 목록 렌더링
    if (currentJobReviewsPromise) {
        try {
            const data = await currentJobReviewsPromise;
            renderReviewList(data);
        } catch (e) {
            listContainer.innerHTML = '<div style="color:#e74c3c; text-align:center; padding:20px;">리뷰를 불러오지 못했습니다.</div>';
        }
    } else {
        loadReviews(jobId);
    }
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('open');
}

/**
 * 리뷰 목록 렌더링
 */
function renderReviewList(data) {
    const listContainer = document.getElementById('reviewList');

    if (!data.reviews || data.reviews.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; color:#555; padding:20px;">첫 번째 평점을 남겨보세요!</div>';
        return;
    }

    listContainer.innerHTML = data.reviews.map(r => `
        <div class="review-item" data-nickname="${escapeHTML(r.nickname)}" style="padding: 10px; border-bottom: 1px solid #222;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="review-rating" style="color:#c89b3c; font-size:0.85rem;">${'★'.repeat(r.rating)}</span>
                <span style="color:#666; font-size:0.75rem;">${escapeHTML(r.nickname)}</span>
            </div>
            <div class="review-comment-text" style="color:#eee; font-size:0.9rem; line-height:1.4;">${escapeHTML(r.comment)}</div>
        </div>
    `).join('');
}

async function loadReviews(jobId) {
    const listContainer = document.getElementById('reviewList');
    listContainer.innerHTML = '<div style="text-align:center; color:#888;">로딩 중...</div>';

    try {
        const res = await fetch(`/api/v1/jobs/${jobId}/reviews`);
        const data = await res.json();
        currentJobReviewsCache = data;
        renderReviewList(data);
    } catch (e) {
        listContainer.innerHTML = '<div style="color:#e74c3c;">리뷰를 불러오지 못했습니다.</div>';
    }
}

/**
 * 리뷰 제출 (UPSERT)
 */
async function submitReview(event) {
    event.preventDefault();
    const modal = document.getElementById('reviewModal');
    const jobId = modal.dataset.jobId;
    const rating = parseInt(document.getElementById('reviewRating').value);
    const comment = document.getElementById('reviewComment').value;

    try {
        const response = await fetch(`/api/v1/jobs/${jobId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, comment: comment })
        });

        if (response.ok) {
            alert('평가가 저장되었습니다.');
            document.getElementById('reviewComment').value = '';

            const listContainer = document.getElementById('reviewList');
            let existingReview = null;
            const items = listContainer.querySelectorAll('.review-item');
            for (const item of items) {
                if (item.dataset.nickname === currentUserNickname) {
                    existingReview = item;
                    break;
                }
            }

            if (existingReview) {
                existingReview.querySelector('.review-rating').textContent = '★'.repeat(rating);
                existingReview.querySelector('.review-comment-text').textContent = comment;
            } else {
                const newReviewHtml = `
                    <div class="review-item" data-nickname="${escapeHTML(currentUserNickname)}" style="padding: 10px; border-bottom: 1px solid #222;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span class="review-rating" style="color:#c89b3c; font-size:0.85rem;">${'★'.repeat(rating)}</span>
                            <span style="color:#666; font-size:0.75rem;">${escapeHTML(currentUserNickname) || '나'}</span>
                        </div>
                        <div class="review-comment-text" style="color:#eee; font-size:0.9rem; line-height:1.4;">${escapeHTML(comment)}</div>
                    </div>
                `;
                if (listContainer.querySelector('div[style*="text-align:center"]')) {
                    listContainer.innerHTML = '';
                }
                listContainer.insertAdjacentHTML('afterbegin', newReviewHtml);
            }

            currentJobReviewsPromise = fetch(`/api/v1/jobs/${jobId}/reviews`).then(res => res.json());
            currentJobReviewsPromise.then(data => {
                document.getElementById('sideAvgRating').textContent = `★ ${data.avg_rating}`;
            });

        } else {
            const err = await response.json();
            alert(err.detail || '저장에 실패했습니다.');
        }
    } catch (e) {
        alert('네트워크 오류가 발생했습니다.');
    }
}

// =============================================
//  Event Listeners
// =============================================
app.addEventListener("click", e => {
    const tile = e.target.closest(".champ-tile");
    if (!tile) return;
    const idx = parseInt(tile.dataset.idx);
    if (idx === selectedIdx) { closeSidebar(); return; }
    openSidebar(idx);
});

document.querySelectorAll(".filter-btn:not(.tag-filter)").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn:not(.tag-filter)").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentSort = btn.dataset.sort;
        renderGrid();
    });
});

document.querySelectorAll(".tag-filter").forEach(btn => {
    btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const val = btn.dataset.val;

        if (activeFilters[key] === val) {
            delete activeFilters[key];
            btn.classList.remove("active");
        } else {
            document.querySelectorAll(`.tag-filter[data-key="${key}"]`).forEach(b => b.classList.remove("active"));
            activeFilters[key] = val;
            btn.classList.add("active");
        }
        closeSidebar();
        renderGrid();
    });
});

document.addEventListener("click", e => {
    if (e.target.closest(".lightbox")) {
        document.getElementById("lightbox").classList.remove("open");
    }
});

const searchInput = document.getElementById("searchInput");
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.trim();
        closeSidebar(); // 검색어 입력 시 열려있는 상세정보 창 닫기 (UX 표준)
        renderGrid();
    });
}

// =============================================
//  Initialize (SSR Hydration)
// =============================================
function initApp() {
    try {
        // 주입된 전역 변수 참조
        if (window.INITIAL_JOBS_DATA) {
            JOBS = window.INITIAL_JOBS_DATA;
            renderGrid();
        } else {
            throw new Error("서버로부터 초기 데이터를 전달받지 못했습니다.");
        }
    } catch (error) {
        console.error("데이터 초기화 중 오류 발생:", error);
        app.innerHTML = `<div style="text-align:center; padding:50px; color:#e74c3c;">데이터베이스 연결에 실패했습니다.</div>`;
    }
}

// 모달 활성화 후 이탈 시 스크롤 잠금 완전 해제 보장 (V8)
window.addEventListener('beforeunload', () => {
    document.body.style.overflow = '';
});
window.addEventListener('popstate', () => {
    document.body.style.overflow = '';
});

// 모바일 필터 아코디언 토글 제어 (V13)
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById('toggleFilterBtn');
    const dashboard = document.getElementById('filterDashboard');
    
    if (toggleBtn && dashboard) {
        toggleBtn.addEventListener('click', () => {
            dashboard.classList.toggle('collapsed');
            const isCollapsed = dashboard.classList.contains('collapsed');
            toggleBtn.innerHTML = isCollapsed 
                ? '<i class="fa-solid fa-sliders"></i> 정렬 및 필터' 
                : '<i class="fa-solid fa-xmark"></i> 필터 닫기';
        });
    }
});

initApp();