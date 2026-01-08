module.exports = {
  champion: {
    statsSection: '.wf-champion__about__stats',
    showStatsButton: '.show-champ-stats',
    rangeInput: '#range',
    abilities: '.statsBlock.abilities .statsBlock__block',
    stats: '.statsBlock.champion .statsBlock__block',
    builds: '.wf-champion__data__items[data-guide-id]',
    spells: '.wf-champion__data__spells[data-guide-id]',
    situational: '.wf-champion__data__situational[data-guide-id]',
    skillOrders: '.wf-champion__data__skills[data-guide-id]',
  },

  tooltip: {
    container: '#tooltip',
    visible: '#tooltip:not([style*="display: none"])',
    image: '.tt__image img',
    title: '.tt__info__title span',
    cost: '.tt__info__cost span',
    stats: '.tt__info__stats span',
    uniques: '.tt__info__uniques span',
  },

  tierList: {
    items: '.wf-tier-list__tiers .ico-holder.ajax-tooltip',
  },

  banners: [
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    '[aria-label="dismiss"]',
  ],
};
