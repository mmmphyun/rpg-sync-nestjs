/**
 * RPG Server Guide Page Premium Interactivity Handler
 * Est. 2026
 */
document.addEventListener('DOMContentLoaded', function() {
    // 온보딩 규칙 모달 읽기 및 동의 여부 플래그
    let isRulesRead = false;

    // === 0. 범용 모달 제어 시스템 ===
    function openModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.remove('hidden');
        modalEl.classList.add('open');
    }

    function closeModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.remove('open');
        modalEl.classList.add('hidden');
    }

    // === 1. 탭 시스템 전환 및 읽기 락(Lock) 검증 로직 ===
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const promiseInput = document.getElementById('promise-input');
    const lockNotice = document.getElementById('lock-notice');
    const completeBtn = document.getElementById('complete-btn');
    const rulesModal = document.getElementById('rules-modal');
    const rulesAgreeChk = document.getElementById('rules-agree-chk');
    const rulesConfirmBtn = document.getElementById('rules-modal-confirm-btn');
    const rulesCloseX = document.getElementById('rules-modal-close-x');
    const completeModal = document.getElementById('complete-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    
    // 읽은 탭 추적 Set 객체 (기본 시작은 tab-wild가 이미 열려 있으므로 1개로 시작)
    const visitedTabs = new Set(['tab-wild']);
    const totalTabs = 6;

    // 인벤토리 상태 관리 변수 정의
    let clickedSlot = null;
    let hoveredSlot = null;

    function checkAllTabsVisited() {
        if (!lockNotice) return; // 뉴비가 아닌 상태 (이미 멤버/게스트) 예외 처리
        
        const count = visitedTabs.size;
        lockNotice.innerHTML = `<i class="fas fa-lock"></i> 가이드의 모든 탭을 차례로 읽으셔야 작성이 가능합니다. (확인 완료: ${count}/${totalTabs})`;
        
        if (count === totalTabs) {
            if (completeBtn) {
                completeBtn.disabled = false;
                completeBtn.classList.add('glow-active');
                const btnSpan = completeBtn.querySelector('span');
                const btnIcon = completeBtn.querySelector('i');
                if (btnSpan) btnSpan.textContent = '중요 수칙 확인 및 동의하기';
                if (btnIcon) btnIcon.className = 'fas fa-arrow-right';
            }
            lockNotice.style.color = "var(--accent-hero)";
            lockNotice.innerHTML = `<i class="fas fa-unlock"></i> 가이드 확인 완료! 아래 중요 수칙을 확인하고 동의해 주세요.`;
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');

            // 버튼 active 토글
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // 콘텐츠 active 토글
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            // 탭 읽음 추적 추가
            visitedTabs.add(targetTab);
            checkAllTabsVisited();

            // 탭 전환 시 인벤토리 선택 상태 초기화
            if (typeof updateUI === 'function') {
                clickedSlot = null;
                hoveredSlot = null;
                updateUI();
            }
        });
    });

    // 얌체 유저 방지 락 (F12 등으로 disabled 강제 제거 시 2차 차단 방어막)
    if (promiseInput) {
        promiseInput.addEventListener('keydown', function(e) {
            if (visitedTabs.size < totalTabs || !isRulesRead) {
                e.preventDefault();
                this.value = '';
                this.blur();
                alert('가이드의 6개 탭을 모두 위에서부터 차례로 누르고 확인한 뒤, 중요 수칙 동의까지 완료해 주시기 바랍니다.');
            }
        });
    }

    // === 1-2. 중요 수칙 모달 이벤트 바인딩 ===
    if (rulesModal) {
        // X 버튼 닫기
        if (rulesCloseX) {
            rulesCloseX.addEventListener('click', function() {
                closeModal(rulesModal);
            });
        }

        // 바깥 영역 클릭 시 닫기
        rulesModal.addEventListener('click', (e) => {
            if (e.target === rulesModal) {
                closeModal(rulesModal);
            }
        });
    }

    if (rulesAgreeChk && rulesConfirmBtn) {
        // 동의 체크박스 상태 변경 시 확인 버튼 활성화 여부 및 동적 피드백 바인딩
        rulesAgreeChk.addEventListener('change', function() {
            rulesConfirmBtn.disabled = !this.checked;
            if (this.checked) {
                rulesConfirmBtn.classList.add('glow-active');
            } else {
                rulesConfirmBtn.classList.remove('glow-active');
            }
        });
    }

    if (rulesConfirmBtn && rulesModal) {
        // 수칙 확인 완료 시 플래그 켜고 서약 영역 활성화
        rulesConfirmBtn.addEventListener('click', function() {
            closeModal(rulesModal);
            isRulesRead = true;

            // 메인 페이지의 #complete-btn 버튼 재정비
            if (completeBtn) {
                completeBtn.disabled = true;
                completeBtn.classList.remove('glow-active');
                const btnSpan = completeBtn.querySelector('span');
                const btnIcon = completeBtn.querySelector('i');
                if (btnSpan) btnSpan.textContent = '가이드 확인 완료';
                if (btnIcon) btnIcon.className = 'fas fa-check-circle';
            }

            // 서약 안내 락 공지 배지 #lock-notice 내용 교체
            if (lockNotice) {
                lockNotice.innerHTML = `가이드 완료! 최종 서약을 위 텍스트와 동일하게 타이핑해주세요.`;
            }

            // 감춰져 있던 서약 인풋 wrapper의 fade-out-input 클래스 제거
            const promiseInputWrapper = promiseInput ? promiseInput.closest('.promise-input-wrapper') : null;
            if (promiseInputWrapper) {
                promiseInputWrapper.classList.remove('fade-out-input');
            }

            // promiseInput 활성화 및 포커스
            if (promiseInput) {
                promiseInput.disabled = false;
                promiseInput.placeholder = "위 문구를 정확하게 입력하고 버튼을 눌러주세요!";
                promiseInput.focus();
            }
        });
    }

    // === 2. 마인크래프트 인벤토리 시뮬레이터 로직 ===
    const invSlots = document.querySelectorAll('.inventory-slot:not(.slot-empty)');
    const menuTitle = document.getElementById('menu-title');
    const menuBadge = document.getElementById('menu-badge');
    const menuDesc = document.getElementById('menu-desc');

    const defaultData = {
        name: "인벤토리 슬롯에 마우스를 올려보세요!",
        badge: "SYSTEM",
        desc: "각 메뉴의 이름과 기능을 자세히 설명해드릴게요."
    };

    function updateDetailCard(name, badge, desc) {
        menuTitle.innerHTML = `${name} <span class="badge-mono" id="menu-badge">${badge}</span>`;
        menuDesc.textContent = desc;
    }

    function updateUI() {
        // 모든 슬롯에서 active 클래스 제거
        invSlots.forEach(slot => slot.classList.remove('active'));

        // 호버 슬롯이 있으면 호버 우선, 없으면 클릭 슬롯 적용
        const targetSlot = hoveredSlot || clickedSlot;

        if (targetSlot) {
            targetSlot.classList.add('active');
            const name = targetSlot.getAttribute('data-name');
            const badge = targetSlot.getAttribute('data-badge');
            const desc = targetSlot.getAttribute('data-desc');
            updateDetailCard(name, badge, desc);
        } else {
            // 둘 다 없으면 기본 정보 복원
            updateDetailCard(defaultData.name, defaultData.badge, defaultData.desc);
        }
    }

    invSlots.forEach(slot => {
        // 마우스 호버 시작
        slot.addEventListener('mouseenter', function() {
            hoveredSlot = this;
            updateUI();
        });

        // 마우스 호버 해제
        slot.addEventListener('mouseleave', function() {
            if (hoveredSlot === this) {
                hoveredSlot = null;
            }
            updateUI();
        });

        // 마우스 클릭 (토글)
        slot.addEventListener('click', function() {
            if (clickedSlot === this) {
                clickedSlot = null;
            } else {
                clickedSlot = this;
            }
            updateUI();
        });
    });

    // === 3. 서약 동의 실시간 타이핑 검증 (복사/붙여넣기 차단) ===
    if (promiseInput && completeBtn) {
        const targetText = "미숙지로 인한 불이익은 본인 책임임을 동의합니다";

        // 직접 기입 텍스트 실시간 검증
        promiseInput.addEventListener('input', function() {
            const userInput = this.value.trim().replace(/\s+/g, ' ');
            
            if (userInput === targetText) {
                completeBtn.disabled = false;
                completeBtn.classList.add('glow-active');
                promiseInput.classList.add('glow-active');
            } else {
                completeBtn.disabled = true;
                completeBtn.classList.remove('glow-active');
                promiseInput.classList.remove('glow-active');
            }
        });

        // 붙여넣기 시도 시 알림 및 이벤트 완전 차단
        promiseInput.addEventListener('paste', function(e) {
            e.preventDefault();
            alert('복사/붙여넣기는 조금 서운하네요.. 직접 타이핑해주세요!');
            return false;
        });

        // 완료 버튼 클릭 시 API 호출 또는 중요 수칙 모달 열기
        completeBtn.addEventListener('click', async function() {
            if (completeBtn.disabled) return;

            // 1. 중요 수칙을 아직 읽지 않았다면 모달 띄우기
            if (!isRulesRead) {
                if (rulesModal) {
                    openModal(rulesModal);
                }
                return;
            }

            // 2. 중요 수칙을 동의했다면 기존 서약 제출 API Fetch 진행
            const btnText = completeBtn.querySelector('span');
            const btnIcon = completeBtn.querySelector('i');
            
            const originalText = btnText ? btnText.textContent : '처리 중...';
            const originalIconClass = btnIcon ? btnIcon.className : 'fas fa-spinner fa-spin';

            completeBtn.disabled = true;
            completeBtn.classList.remove('glow-active');
            if (btnText) btnText.textContent = '처리 중...';
            if (btnIcon) btnIcon.className = 'fas fa-spinner fa-spin';

            try {
                const response = await fetch('/api/v1/auth/complete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const result = await response.json();

                if (response.ok && result.message === 'success') {
                    if (completeModal) openModal(completeModal);
                } else {
                    alert(result.detail || '가이드 완료 처리 중 오류가 발생했습니다.');
                    completeBtn.disabled = false;
                    completeBtn.classList.add('glow-active');
                    if (btnText) btnText.textContent = originalText;
                    if (btnIcon) btnIcon.className = originalIconClass;
                }
            } catch (error) {
                console.error('API 호출 에러:', error);
                alert('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
                completeBtn.disabled = false;
                completeBtn.classList.add('glow-active');
                if (btnText) btnText.textContent = originalText;
                if (btnIcon) btnIcon.className = originalIconClass;
            }
        });

        // 모달 닫기 및 홈으로 리다이렉트
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', function() {
                if (completeModal) closeModal(completeModal);
                window.location.href = '/';
            });
        }
    }

    // === 4. Leaflet.js 픽셀 아트 이미지 오버레이 지도 매핑 엔진 ===
    const mapContainer = document.getElementById('spawn-leaflet-map');
    if (mapContainer) {
        const mapTabBtn = document.querySelector('[data-tab="tab-system"]');
        let leafletMapInstance = null;

        function initSpawnMap() {
            if (leafletMapInstance) return;

            // 지도 인스턴스 초기화 (CRS.Simple 방식을 사용하여 지리 위경도가 아닌 이미지 고유 픽셀 좌표 사용)
            leafletMapInstance = L.map('spawn-leaflet-map', {
                crs: L.CRS.Simple,
                minZoom: -1,
                maxZoom: 2,
                zoomSnap: 0.5
            });

            // 스폰 이미지 로드 경로 (public/images/spawn-map.png -> static 매핑)
            const mapImageUrl = '/static/images/spawn-map.png';
            const mapBounds = [[0, 0], [1000, 1000]]; // 1000x1000 상대적 픽셀 좌표 바운드 생성

            // 이미지 레이어 얹기
            L.imageOverlay(mapImageUrl, mapBounds).addTo(leafletMapInstance);
            leafletMapInstance.fitBounds(mapBounds);

            // === 주요 스폰 시설 핀(Pin) 합성 매핑 ===
            // 좌표 [y, x] 데이터 정의 (픽셀 맵 상에서의 상대 좌표값)
            const pins = [
                {
                    coords: [506, 648],
                    title: "📍 서버 중앙 스폰",
                    desc: "카틀리아 대륙으로 첫 발을 내딛는 스폰 광장이에요! 일일 상점과 교환 상점을 꼭 확인해보세요."
                },
                {
                    coords: [540, 365],
                    title: "🛠️ 생활 직업 전직 및 강화",
                    desc: "돈을 벌기 위해선 먼저 일자리를 찾아야겠죠? 현재 전직 가능한 생활 직업이 무엇이 있는지 알아보자구요. <br>전직관의 왼편을 살펴보니 생활 직업 도구를 강화할 수도 있네요!"
                },
                {
                    coords: [650, 530],
                    title: "💵 잡상인 / 사서 / 연금술사",
                    desc: "특수 광물, 음식 등을 판매하는 잡상인! <br>인챈트책을 전문적으로 매입하는 사서! <br>추출한 구슬을 사고파는 연금술사! <br>배가 고프면 가장 먼저 찾아가야겠네요!"
                },
                {
                    coords: [385, 380],
                    title: "💵 농사 / 탐험 / 어부",
                    desc: "이름에 걸맞는 아이템들을 매입하는 상인들이 자리해 있네요!"
                },
                {
                    coords: [385, 485],
                    title: "💵 나무 / 광물 / 사냥",
                    desc: "이름에 걸맞는 아이템들을 매입하는 상인들이 자리해 있네요!"
                },
                {
                    coords: [400, 160],
                    title: "💵 무기 / 도구 / 갑옷 / 소비",
                    desc: "이름에 걸맞는 아이템들을 매입하는 상인들이 자리해 있네요!"
                },
                {
                    coords: [710, 835],
                    title: "👤 레미",
                    desc: "무언가 아픈 기억을 가진 듯한 한 남자가 서 있네요.. 한 번 이야기를 들어주는 게 어떨까요?"
                },
                {
                    coords: [775, 910],
                    title: "🗡️ 지옥문",
                    desc: "네더는 위험해요! 머리부터 발끝까지 다시 한번 확인해 보죠. 준비되셨나요?"
                }
            ];

            // 핀 추가하기
            const PIN_HITBOX_SIZE = 40; // 👈 클릭 감지 영역 범위 설정 (기본값: 40px)
            pins.forEach(pin => {
                const customIcon = L.divIcon({
                    className: 'custom-map-pin',
                    html: '<div class="pin-pulse-ring"></div>',
                    iconSize: [PIN_HITBOX_SIZE, PIN_HITBOX_SIZE],
                    iconAnchor: [PIN_HITBOX_SIZE / 2, PIN_HITBOX_SIZE / 2]
                });

                L.marker(pin.coords, { icon: customIcon })
                    .addTo(leafletMapInstance)
                    .bindPopup(`<strong style="color: var(--accent-hero); font-size: 0.95rem;">${pin.title}</strong><p style="margin-top: 6px; font-size: 0.85rem; line-height: 1.4; color: var(--text-main);">${pin.desc}</p>`);
            });
        }

        // 탭 전환 감시 및 렌더링 교정 (display: none 상태에서 로드 시 깨짐 예방)
        mapTabBtn.addEventListener('click', function() {
            setTimeout(() => {
                initSpawnMap();
                if (leafletMapInstance) {
                    leafletMapInstance.invalidateSize();
                }
            }, 100);
        });
    }

    // === 5. 스토리 전문 보기 모달 로직 ===
    const storyModal = document.getElementById('story-modal');
    const storyTrigger = document.getElementById('story-read-trigger');
    const storyCloseX = document.getElementById('story-modal-close-x');
    const storyCloseBtn = document.getElementById('story-modal-close-btn');

    if (storyModal && storyTrigger) {
        // 열기
        storyTrigger.addEventListener('click', () => openModal(storyModal));

        // X 버튼 닫기
        if (storyCloseX) {
            storyCloseX.addEventListener('click', () => closeModal(storyModal));
        }

        // 하단 버튼 닫기
        if (storyCloseBtn) {
            storyCloseBtn.addEventListener('click', () => closeModal(storyModal));
        }

        // 바깥 영역 클릭 시 닫기
        storyModal.addEventListener('click', (e) => {
            if (e.target === storyModal) {
                closeModal(storyModal);
            }
        });
    }
});
