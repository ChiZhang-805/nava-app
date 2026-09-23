/* 回顾页的设计坐标：Canvas 小猫、触摸区域和 DOM 卡片共用同一份几何数据。 */
__fluffyModules["review-layout.js"] = (() => {
    "use strict";
    const liftY = 44;
    const weekBottom = 710;
    const summaryTop = 308 - liftY;
    const summaryHeight = 166;
    const weekTop = summaryTop + summaryHeight + 14;
    const weekHeight = weekBottom - weekTop;
    // 图表之外：边框2 + 内边距31 + 标题20 + 顶间距8 + 数字区18 + 日期区23 + 底间距12 + 摘要17。
    const plotHeight = weekHeight - 131;
    const geometry = Object.freeze({
        liftY, actorX: 17, actorY: 45 - liftY, actorScaleX: .65, actorScaleY: .63,
        petTop: 164 - liftY, bubbleTop: 181 - liftY,
        summaryTop, summaryHeight, weekTop, weekHeight, weekBottom, plotHeight
    });

    /**
     * 输入：root（回顾页容器 HTMLElement）。
     * 输出：无，写入该容器独享的 CSS 设计坐标。
     * 功能：同步上移小猫的点击区域、气泡和当天卡片，把增加的高度全部交给近七天模块。
     */
    function applyLayout(root) {
        // 阶段一：集中给出属性映射，保持顶部导航与底部录音按钮的原位置不变。
        const values = {
            "--review-pet-top": geometry.petTop,
            "--review-bubble-top": geometry.bubbleTop,
            "--review-summary-top": geometry.summaryTop,
            "--review-summary-height": geometry.summaryHeight,
            "--review-week-top": geometry.weekTop,
            "--review-week-height": geometry.weekHeight,
            "--review-plot-height": geometry.plotHeight
        };
        // 阶段二：只更新回顾容器，避免影响六类记录表单、首页和专注倒计时。
        for (const [name, value] of Object.entries(values)) root.style.setProperty(name, `${value}px`);
    }

    /**
     * 输入：score（0—100 的分数，缺失或非数值可传 null）。
     * 输出：与分数成比例的设计像素高度；缺失/非数值返回0，不创建占位假数据。
     * 功能：柱高使用真实绘图区的135像素上限，而不是旧版固定的0.79倍换算。
     */
    function barHeight(score) {
        if (typeof score !== "number" || !Number.isFinite(score)) return 0;
        return Math.min(100, Math.max(0, score)) / 100 * geometry.plotHeight;
    }

    return { geometry, applyLayout, barHeight };
})();
