// js/missions.js — CLEAN & FINAL VERSION (supports C, B, A, S, SS)

document.addEventListener('DOMContentLoaded', () => {
  const tabsContainer = document.querySelector('.mission-tabs');
  const listContainer = document.querySelector('.mission-list');

  let allMissions = [];

  /**
   * Render all missions for a selected category
   */
  function renderMissionsForCategory(categoryName) {

    // Filter + sort missions
    const missionsToRender = allMissions
      .filter(m => m.category === categoryName)
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

    listContainer.innerHTML = '';

    missionsToRender.forEach(mission => {
      const card = document.createElement('div');
      card.className = 'mission-card';

      // ---------------------------
      // Banner (styled fallback when the art file is missing —
      // most legacy missions ship without banner images)
      // ---------------------------
      const CATEGORY_THEMES = {
        'Super Impact':              ['#4a0d0d', '#8b1a1a', '#ff6b45'],
        'Impact Missions':           ['#3a2604', '#7a5410', '#ffd24a'],
        'Shinobi Chronicles Part 1': ['#0d2a12', '#1e5a2a', '#7fdc8f'],
        'Shinobi Chronicles Part 2': ['#0d1c3a', '#1e3f7a', '#7fb2ff'],
        'Limited Time Event':        ['#2a0d3a', '#5a1e7a', '#d67fff'],
        'Growth Missions':           ['#0d2a2a', '#1e5a5a', '#7fdcdc']
      };

      const banner = document.createElement('img');
      banner.className = 'mission-banner';
      banner.src = mission.banner || 'assets/missions/banners/default_banner.png';
      banner.alt = mission.name || 'Mission Banner';
      banner.onerror = () => {
        const [dark, mid, glow] = CATEGORY_THEMES[mission.category] || ['#1a1a2a', '#2a2a4a', '#d4af37'];
        const fallback = document.createElement('div');
        fallback.className = 'mission-banner mission-banner-fallback';
        fallback.style.background = `
          repeating-linear-gradient(-55deg, transparent 0 14px, rgba(0,0,0,0.18) 14px 16px),
          radial-gradient(circle at 85% 20%, ${mid}cc, transparent 60%),
          linear-gradient(100deg, ${dark} 0%, ${mid} 55%, ${dark} 100%)`;
        fallback.innerHTML = `
          <span class="mbf-category" style="color:${glow}">${mission.category || ''}</span>
          <span class="mbf-name">${mission.name || 'Mission'}</span>`;
        banner.replaceWith(fallback);
      };
      card.appendChild(banner);

      // ---------------------------
      // Controls container
      // ---------------------------
      const controls = document.createElement('div');
      controls.className = 'mission-controls';

      // ---------------------------
      // Difficulty icons row
      // ---------------------------
      const difficultyContainer = document.createElement('div');
      difficultyContainer.className = 'difficulty-icons-container';

      const availableDifficulties = Object.keys(mission.difficulties || {});
      let selectedDifficulty = availableDifficulties[0] || 'C';

      availableDifficulties.forEach(rank => {
        const button = document.createElement('button');
        button.className = 'difficulty-icon-btn';
        button.dataset.difficulty = rank;

        const icon = document.createElement('img');

        // ✔ Each rank uses its own icon file
        // c_icons.png, b_icons.png, a_icons.png, s_icons.png, ss_icons.png
        const safeRank = rank.toLowerCase(); // handles "SS", "Ex", etc.
        icon.src = `assets/icons/${safeRank}_icons.png`;
        icon.alt = rank + ' Rank';

        // If icon missing → fallback to text
        icon.onerror = () => {
          icon.remove();
          button.textContent = rank;
          button.classList.add('difficulty-fallback');
        };

        button.appendChild(icon);

        // Default active difficulty
        if (rank === selectedDifficulty) {
          button.classList.add('active');
        }

        // Switch difficulty
        button.addEventListener('click', () => {
          difficultyContainer.querySelectorAll('.difficulty-icon-btn')
            .forEach(b => b.classList.remove('active'));

          button.classList.add('active');
          selectedDifficulty = rank;
        });

        difficultyContainer.appendChild(button);
      });

      controls.appendChild(difficultyContainer);

      // ---------------------------
      // Start Mission Button
      // ---------------------------
      const startButton = document.createElement('button');
      startButton.className = 'start-btn';
      startButton.textContent = 'Start Mission';

      startButton.addEventListener('click', () => {
        localStorage.setItem('currentMissionId', String(mission.id));
        localStorage.setItem('currentDifficulty', selectedDifficulty);
        localStorage.setItem('currentMissionName', mission.name || '');
        localStorage.setItem('currentMissionBanner', mission.banner || '');

        // Fade transition
        document.body.style.transition = 'opacity 0.25s linear';
        document.body.style.opacity = '0';

        setTimeout(() => {
          window.location.href = 'teams.html?mode=prebattle';
        }, 250);
      });

      controls.appendChild(startButton);

      // Attach to card
      card.appendChild(controls);
      listContainer.appendChild(card);
    });

    // Highlight selected category tab
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.textContent === categoryName);
    });
  }

  /**
   * Load mission data from JSON
   */
  fetch('data/missions.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(missions => {
      allMissions = Array.isArray(missions) ? missions : [];

      if (allMissions.length === 0) {
        listContainer.innerHTML = '<p class="error-message">No missions found.</p>';
        return;
      }

      // Extract categories
      const categoryNames = [...new Set(allMissions.map(m => m.category || 'Other'))];

      // Build tabs
      tabsContainer.innerHTML = '';
      categoryNames.forEach(name => {
        const tab = document.createElement('button');
        tab.className = 'tab-btn';
        tab.textContent = name;
        tab.addEventListener('click', () => renderMissionsForCategory(name));
        tabsContainer.appendChild(tab);
      });

      // Load first category
      renderMissionsForCategory(categoryNames[0]);
    })
    .catch(err => {
      console.error('Mission load failed:', err);
      listContainer.innerHTML = '<p class="error-message">Failed to load missions.</p>';
    });
});
