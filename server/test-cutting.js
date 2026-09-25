/* 排料算法自检：面积守恒、刀路几何、多板、旋转与报错路径 */
'use strict';
const assert = require('assert');
const { cutBoards, recutBoards, cancelPreviewBoards, UserError } = require('./src/cutting');

// 1) 示例数据：面积守恒 + 基本字段
const r = cutBoards({
  boardWidth: 2440, boardHeight: 1220, kerf: 3,
  parts: [
    { name: '柜门', width: 600, height: 400, quantity: 4 },
    { name: '侧板', width: 800, height: 350, quantity: 3 },
    { name: '抽屉面', width: 500, height: 200, quantity: 6 },
    { name: '背板条', width: 1000, height: 120, quantity: 2 },
  ],
});
assert.ok(r.boardsCount >= 1);
for (const b of r.boards) {
  const boardArea = b.width * b.height;
  assert(Math.abs(boardArea - b.partsArea - b.kerfArea - b.remainderArea) < 0.01,
    `板 ${b.index} 面积不守恒`);
  // 零件不得超出原板
  for (const p of b.placements) {
    assert(p.x >= -1e-6 && p.y >= -1e-6, '零件起点越界');
    assert(p.x + p.w <= b.width + 1e-6 && p.y + p.h <= b.height + 1e-6, '零件越界');
  }
  // 零件两两不重叠
  const ps = b.placements;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j];
      const overlap = a.x < c.x + c.w - 1e-6 && c.x < a.x + a.w - 1e-6 &&
        a.y < c.y + c.h - 1e-6 && c.y < a.y + a.h - 1e-6;
      assert(!overlap, `板 ${b.index} 零件重叠：${a.part}/${c.part}`);
    }
  }
  // 刀序从 1 连续，每刀端点在板内
  b.cuts.forEach((cut, i) => {
    assert.strictEqual(cut.seq, i + 1);
    assert(cut.x1 >= -1e-6 && cut.x2 <= b.width + 1e-6);
    assert(cut.y1 >= -1e-6 && cut.y2 <= b.height + 1e-6);
  });
}
assert.strictEqual(r.totalParts, 15);
assert.strictEqual(r.boards[0].cuts.length > 0, true, '应有刀路');
console.log('用板数:', r.boardsCount, '| 余料:', r.remainderArea, '| 锯缝:', r.kerfArea, '| 利用率:', r.utilization + '%');

// 2) 零件恰好铺满：无刀、余料 0
const full = cutBoards({
  boardWidth: 1000, boardHeight: 600, kerf: 2,
  parts: [{ name: '整板', width: 1000, height: 600, quantity: 1 }],
});
assert.strictEqual(full.boardsCount, 1);
assert.strictEqual(full.boards[0].cuts.length, 0);
assert.strictEqual(full.remainderArea, 0);

// 3) 锯缝为 0：仍记录刀序，仍有余料矩形
const k0 = cutBoards({
  boardWidth: 1000, boardHeight: 500, kerf: 0,
  parts: [{ name: 'A', width: 400, height: 300, quantity: 2 }],
});
assert.ok(k0.boards[0].cuts.length >= 2, '零锯缝也应有切割刀路');
assert.strictEqual(k0.kerfArea, 0);
assert.strictEqual(k0.partsArea + k0.remainderArea, 500000);

// 4) 必须旋转才能放下
const rot = cutBoards({
  boardWidth: 500, boardHeight: 300, kerf: 0,
  parts: [{ name: '横条', width: 280, height: 400, quantity: 1 }], // 正向 280x400 放不下，旋转后 400x280 可以
});
assert.strictEqual(rot.boards[0].placements[0].rotated, true);

// 5) 旋转后仍放不下 → 报错
assert.throws(() => cutBoards({
  boardWidth: 500, boardHeight: 300, kerf: 0,
  parts: [{ name: '大块', width: 400, height: 400, quantity: 1 }],
}), UserError);

// 6) 多板：每件 600x400，板 1200x800 恰好 2x2 放 4 件，9 件需要 3 张
const multi = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0,
  parts: [{ name: '块', width: 600, height: 400, quantity: 9 }],
});
assert.strictEqual(multi.boardsCount, 3);
assert.deepStrictEqual(multi.boards.map((b) => b.placements.length), [4, 4, 1]);

// 7) 锯缝计入：600x400 两件并排放在 1203 宽板上（600+3+600），宽度刚好
const kerfFit = cutBoards({
  boardWidth: 1203, boardHeight: 400, kerf: 3,
  parts: [{ name: '条', width: 600, height: 400, quantity: 2 }],
});
assert.strictEqual(kerfFit.boardsCount, 1);
assert.strictEqual(kerfFit.boards[0].cuts.length, 1); // 只有竖切一刀
assert.strictEqual(kerfFit.kerfArea, 3 * 400);

// 8) 锯缝挤压：1202 宽放不下两件 → 第二件开新板
const noFit = cutBoards({
  boardWidth: 1202, boardHeight: 400, kerf: 3,
  parts: [{ name: '条', width: 600, height: 400, quantity: 2 }],
});
assert.strictEqual(noFit.boardsCount, 2);

// 9) 输入校验
assert.throws(() => cutBoards({ boardWidth: 0, boardHeight: 10, kerf: 0, parts: [{ name: 'a', width: 1, height: 1, quantity: 1 }] }), UserError);
assert.throws(() => cutBoards({ boardWidth: 10, boardHeight: 10, kerf: -1, parts: [{ name: 'a', width: 1, height: 1, quantity: 1 }] }), UserError);
assert.throws(() => cutBoards({ boardWidth: 10, boardHeight: 10, kerf: 0, parts: [] }), UserError);
assert.throws(() => cutBoards({ boardWidth: 10, boardHeight: 10, kerf: 0, parts: [{ name: 'a', width: 5, height: 5, quantity: 0 }] }), UserError);

// 10) 多订单拼版：跨板、订单归属、同名零件允许、按输入顺序切割
const mo = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 10,
  orders: [
    { orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
    { orderNo: 'B', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
  ],
});
assert.strictEqual(mo.boardsCount, 3);
assert.strictEqual(mo.mode, 'orders');
// 顺序：先 A×5 再 B×5，每板 4 件 → 板1 A×4，板2 A×1+B×3，板3 B×2
const counts = (b, order) => b.placements.filter((p) => p.order === order).length;
assert.strictEqual(counts(mo.boards[0], 'A'), 4);
assert.strictEqual(counts(mo.boards[0], 'B'), 0);
assert.strictEqual(counts(mo.boards[1], 'A'), 1);
assert.strictEqual(counts(mo.boards[1], 'B'), 3);
assert.strictEqual(counts(mo.boards[2], 'B'), 2);
assert.ok(mo.boards[1].placements[0].order === 'A', '板2 首件应为先输入的订单 A');
assert.strictEqual(mo.boards[1].placements[0].part, '块'); // 不同订单同名零件

// 逐板分摊额之和 = 板价
for (const b of mo.boards) {
  const sum = b.cost.shares.reduce((s, x) => s + x.cents, 0);
  assert.strictEqual(sum, b.cost.priceCents, `板 ${b.index} 分摊额不等于板价`);
}
// 订单汇总 = 总板价（A: 1000 + 250 = 1250；B: 750 + 1000 = 1750）
assert.strictEqual(mo.totalMaterialCents, 3000);
const sumOrders = mo.orders.reduce((s, o) => s + o.materialCents, 0);
assert.strictEqual(sumOrders, mo.totalMaterialCents, '订单汇总额不等于总板价');
const oA = mo.orders.find((o) => o.order === 'A');
const oB = mo.orders.find((o) => o.order === 'B');
assert.strictEqual(oA.materialCents, 1250);
assert.strictEqual(oB.materialCents, 1750);
assert.deepStrictEqual(oA.boardIndices, [1, 2]);
assert.deepStrictEqual(oB.boardIndices, [2, 3]);
assert.strictEqual(oA.partsCount, 5);
assert.strictEqual(oB.partsCount, 5);

// 分单取件清单：按订单列出件号 / 板号 / 坐标，板号升序且不重复
for (const pl of mo.pickList) {
  const boards = pl.items.map((it) => it.board);
  assert.deepStrictEqual(boards, [...boards].sort((a, b) => a - b), `订单 ${pl.order} 取件清单未按板号排序`);
  assert.strictEqual(pl.items.length, 5);
  for (const it of pl.items) {
    assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y), '取件清单缺少坐标');
  }
}
const plA = mo.pickList.find((p) => p.order === 'A');
assert.deepStrictEqual(plA.items.map((it) => it.board), [1, 1, 1, 1, 2]);
assert.deepStrictEqual(plA.items.map((it) => it.index), [1, 2, 3, 4, 5]);

// 11) 最大余数法：同余时按订单输入顺序补尾差
const tie = cutBoards({
  boardWidth: 1000, boardHeight: 1000, kerf: 0, boardPrice: 10.01, // 1001 分
  orders: [
    { orderNo: '甲', parts: [{ name: 'a', width: 250, height: 1000, quantity: 2 }] }, // 500000
    { orderNo: '乙', parts: [{ name: 'b', width: 250, height: 1000, quantity: 2 }] }, // 500000
  ],
});
assert.strictEqual(tie.boardsCount, 1);
const tieShares = tie.boards[0].cost.shares;
assert.strictEqual(tieShares.reduce((s, x) => s + x.cents, 0), 1001);
assert.strictEqual(tieShares[0].order, '甲');
assert.strictEqual(tieShares[0].cents, 501); // 500.5 同余，输入顺序在先者得尾差
assert.strictEqual(tieShares[1].cents, 500);

// 12) 最大余数法：余数不同，大者优先
const lr = cutBoards({
  boardWidth: 1000, boardHeight: 1000, kerf: 0, boardPrice: 0.03, // 3 分
  orders: [
    { orderNo: '甲', parts: [{ name: 'a', width: 600, height: 1000, quantity: 1 }] }, // 60% → 1.8 分
    { orderNo: '乙', parts: [{ name: 'b', width: 400, height: 1000, quantity: 1 }] }, // 40% → 1.2 分
  ],
});
const lrShares = lr.boards[0].cost.shares;
assert.strictEqual(lrShares.find((x) => x.order === '甲').cents, 2);
assert.strictEqual(lrShares.find((x) => x.order === '乙').cents, 1);

// 13) 多订单输入校验
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  orders: [
    { orderNo: 'X1', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] },
    { orderNo: 'X1', parts: [{ name: 'b', width: 10, height: 10, quantity: 1 }] },
  ],
}), UserError, '订单号重复应报错');

assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  orders: [{ orderNo: 'X', parts: [
    { name: '同', width: 10, height: 10, quantity: 1 },
    { name: '同', width: 10, height: 10, quantity: 1 },
  ] }],
}), UserError, '同订单内零件同名应报错');

assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, boardPrice: -1,
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '负板价应报错');

assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, boardPrice: 1.234,
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '超过两位小数应报错');

assert.doesNotThrow(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, boardPrice: 0,
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), '零板价应允许');

// 无订单号 / 无零件名自动补默认值
const def = cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  orders: [{ parts: [{ width: 10, height: 10, quantity: 1 }] }],
});
assert.strictEqual(def.orders[0].order, '订单1');
assert.strictEqual(def.boards[0].placements[0].part, '零件1');

// 旧版顶层 parts 仍然兼容
const legacy = cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  parts: [{ name: 'a', width: 10, height: 10, quantity: 2 }],
});
assert.strictEqual(legacy.mode, 'single');
assert.strictEqual(legacy.boards[0].placements[0].order, '订单1');
assert.strictEqual(legacy.boardPrice, 0);

// 14) 缺件补切：原方案不变、三元身份、原输入顺序、逐件关联原/新板号
const base = {
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 10,
  orders: [
    { orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
    { orderNo: 'B', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
  ],
};
const rc = recutBoards({
  ...base,
  damaged: [
    { order: 'B', part: '块', index: 2 }, // 故意乱序：应按原输入顺序重排
    { order: 'A', part: '块', index: 5 },
    { order: 'A', part: '块', index: 1 },
  ],
});
// 原方案落位与分摊保持不变（与直接计算完全一致）
assert.deepStrictEqual(rc.original, cutBoards(base));
// 补切清单按原输入顺序（订单 → 零件行 → 件号）：A#1、A#5 在 B#2 之前
assert.strictEqual(rc.recut.damagedCount, 3);
assert.deepStrictEqual(rc.recut.items.map((it) => [it.order, it.index]), [['A', 1], ['A', 5], ['B', 2]]);
// 逐件关联原板号与新板号（原方案：A#1 在板1，A#5、B#2 在板2；3 件合并进 1 张新板）
assert.deepStrictEqual(rc.recut.items.map((it) => it.srcBoard), [1, 2, 2]);
assert.deepStrictEqual(rc.recut.items.map((it) => it.board), [1, 1, 1]);
// 新增板数与材料费
assert.strictEqual(rc.recut.addedBoards, 1);
assert.strictEqual(rc.recut.addedMaterialCents, 1000);
// 补切板面积守恒、刀序连续
for (const b of rc.recut.boards) {
  const boardArea = b.width * b.height;
  assert(Math.abs(boardArea - b.partsArea - b.kerfArea - b.remainderArea) < 0.01, '补切板面积不守恒');
  b.cuts.forEach((cut, i) => assert.strictEqual(cut.seq, i + 1));
  const ps = b.placements;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j];
      const overlap = a.x < c.x + c.w - 1e-6 && c.x < a.x + a.w - 1e-6 &&
        a.y < c.y + c.h - 1e-6 && c.y < a.y + a.h - 1e-6;
      assert(!overlap, '补切板零件重叠');
    }
  }
}
// 补切落位保留三元身份（原件号、原板号）
assert.deepStrictEqual(rc.recut.boards[0].placements.map((p) => [p.order, p.part, p.index, p.srcBoard]),
  [['A', '块', 1, 1], ['A', '块', 5, 2], ['B', '块', 2, 2]]);
// 补切逐板分摊守恒 + 按订单汇总（A 两件 2/3、B 一件 1/3，尾差归余数大的 A）
const rcShares = rc.recut.boards[0].cost.shares;
assert.strictEqual(rcShares.reduce((s, x) => s + x.cents, 0), 1000);
const rcA = rc.recut.orders.find((o) => o.order === 'A');
const rcB = rc.recut.orders.find((o) => o.order === 'B');
assert.strictEqual(rcA.partsCount, 2);
assert.strictEqual(rcB.partsCount, 1);
assert.strictEqual(rcA.materialCents, 667);
assert.strictEqual(rcB.materialCents, 333);
assert.strictEqual(rcA.materialCents + rcB.materialCents, rc.recut.addedMaterialCents);
assert.deepStrictEqual(rcA.boardIndices, [1]);

// 15) 补切多板：5 件 600×400 需要 2 张新板
const rc2 = recutBoards({
  ...base,
  damaged: [1, 2, 3, 4, 5].map((i) => ({ order: 'A', part: '块', index: i })),
});
assert.strictEqual(rc2.recut.addedBoards, 2);
assert.strictEqual(rc2.recut.addedMaterialCents, 2000);
assert.deepStrictEqual(rc2.recut.items.map((it) => it.board), [1, 1, 1, 1, 2]);
assert.deepStrictEqual(rc2.recut.items.map((it) => it.srcBoard), [1, 1, 1, 1, 2]);
assert.deepStrictEqual(rc2.recut.items.map((it) => it.index), [1, 2, 3, 4, 5]);

// 16) 跨订单同名零件按三元身份区分：只补切 B 的「块」，不涉及 A 的同名件
const rc3 = recutBoards({ ...base, damaged: [{ order: 'B', part: '块', index: 4 }] });
assert.strictEqual(rc3.recut.damagedCount, 1);
assert.strictEqual(rc3.recut.items[0].order, 'B');
assert.strictEqual(rc3.recut.items[0].srcBoard, 3); // B#4 在原方案板3
assert.strictEqual(rc3.recut.boards[0].placements.length, 1);

// 17) 补切按原始尺寸重排：原方案中被旋转的件，补切以原始尺寸重新参与排料
const rotRc = recutBoards({
  boardWidth: 500, boardHeight: 300, kerf: 0,
  orders: [{ orderNo: 'R', parts: [{ name: '横条', width: 280, height: 400, quantity: 1 }] }],
  damaged: [{ order: 'R', part: '横条', index: 1 }],
});
assert.strictEqual(rotRc.original.boards[0].placements[0].rotated, true);
assert.strictEqual(rotRc.recut.items[0].rotated, true);
assert.strictEqual(rotRc.recut.items[0].w, 400); // 原始 280×400 旋转后占位 400×280
assert.strictEqual(rotRc.recut.items[0].h, 280);

// 18) 补切校验：空选择、件不存在、重复选择、缺字段、非法件号
assert.throws(() => recutBoards({ ...base, damaged: [] }), UserError, '空选择应报错');
assert.throws(() => recutBoards({ ...base }), UserError, '缺少 damaged 应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: 'A', part: '块', index: 99 }] }), UserError, '件号超出数量应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: 'A', part: '不存在', index: 1 }] }), UserError, '零件名不存在应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: 'C', part: '块', index: 1 }] }), UserError, '订单号不存在应报错');
assert.throws(() => recutBoards({
  ...base,
  damaged: [{ order: 'A', part: '块', index: 1 }, { order: 'A', part: '块', index: 1 }],
}), UserError, '重复选择应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: 'A', part: '块' }] }), UserError, '缺件号应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: 'A', part: '块', index: 0 }] }), UserError, '件号 0 应报错');
assert.throws(() => recutBoards({ ...base, damaged: [{ order: '', part: '块', index: 1 }] }), UserError, '缺订单号应报错');

// 19) 设备最大单刀长度：留空沿用现有规则；填写时必须为正数
const unrestricted = cutBoards({
  boardWidth: 1000, boardHeight: 1000, kerf: 0,
  parts: [{ name: 'a', width: 600, height: 300, quantity: 1 }],
});
assert.strictEqual(unrestricted.maxCutLength, null, '未填上限应为 null');
const withLimit = cutBoards({
  boardWidth: 1000, boardHeight: 800, kerf: 3, maxCutLength: 800,
  parts: [{ name: 'a', width: 600, height: 300, quantity: 1 }],
});
assert.strictEqual(withLimit.maxCutLength, 800, '结果应回显所用上限');
assert.ok(Math.max(...withLimit.boards[0].cuts.map((c) => c.length)) <= 800 + 1e-6);
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, maxCutLength: 0,
  parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }],
}), UserError, '上限为 0 应报错');
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, maxCutLength: -3,
  parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }],
}), UserError, '负上限应报错');
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000, maxCutLength: 'abc',
  parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }],
}), UserError, '非数字上限应报错');

// 20) 上限只允许不超限的切法：600×300 落 1000×800 空板（kerf 3）
//     竖切优先 = 竖切 800 + 横切 600；横切优先 = 横切 1000 + 竖切 300
//     不设上限时按现有规则选余料面积更大的横切优先；上限 900 时横切优先超限，
//     改用竖切优先（800 ≤ 900）
const noLimitPart = { name: 'a', width: 600, height: 300, quantity: 1 };
const noLimitBoard = { boardWidth: 1000, boardHeight: 800, kerf: 3 };
const noLimit = cutBoards({ ...noLimitBoard, parts: [noLimitPart] });
assert.deepStrictEqual(noLimit.boards[0].cuts.map((c) => c.type), ['h', 'v'], '不限时应按余料规则选横切优先');
const lim = cutBoards({ ...noLimitBoard, maxCutLength: 900, parts: [noLimitPart] });
assert.strictEqual(lim.boardsCount, 1);
const limCuts = lim.boards[0].cuts;
// 竖切优先：先竖切（长 800），再横切（长 600）
assert.deepStrictEqual(limCuts.map((c) => c.type), ['v', 'h']);
assert.strictEqual(limCuts[0].length, 800);
assert.strictEqual(limCuts[1].length, 600);
assert.strictEqual(lim.boards[0].longestCut, 800, 'longestCut 应为该板实际最长刀');
assert(lim.boards[0].longestCut <= 900 + 1e-6, '实际最长刀不得超过上限');
// 上限 800 时竖切优先恰好可行（边界值，容差内）
const limEdge = cutBoards({ ...noLimitBoard, maxCutLength: 800, parts: [noLimitPart] });
assert.deepStrictEqual(limEdge.boards[0].cuts.map((c) => c.type), ['v', 'h']);
// 上限 799 时两种切法均超限（新板也无法加工）
assert.throws(() => cutBoards({ ...noLimitBoard, maxCutLength: 799, parts: [noLimitPart] }), UserError);

// 21) 上限迫使切法改变：竖切优先可行、横切优先不可行时选竖切优先
//     零件 600×700：竖切优先 = 竖切 1000 + 横切 600（竖切超限）；
//     横切优先 = 横切 1000 + 竖切 700（横切超限）。上限 900 时：
//     竖切优先仍有 1000 刀 → 不可行；旋转 700×600：竖切优先 = 1000 + 横切 700（不可行），
//     横切优先 = 横切 1000 + 竖切 600（不可行）→ 新板也无法加工，报错并给出订单 / 零件 / 件号
const badInput = {
  boardWidth: 1000, boardHeight: 1000, kerf: 0, maxCutLength: 900,
  orders: [{ orderNo: 'SO-X', parts: [{ name: '大板', width: 600, height: 700, quantity: 2 }] }],
};
let errMsg = '';
try {
  cutBoards(badInput);
  assert.fail('应当因超刀长报错');
} catch (e) {
  assert(e instanceof UserError);
  errMsg = e.message;
}
assert(/SO-X/.test(errMsg) && /大板/.test(errMsg) && /第 1 件/.test(errMsg),
  '错误信息应指出订单、零件与件号：' + errMsg);
assert(/900/.test(errMsg), '错误信息应给出上限：' + errMsg);

// 22) 现有板无可行落位时仍尝试新板：先放一件让现有余料全是窄条，第二件只能开新板
//     板 1000×1000、上限 1000（仅整板级刀路可行）：第一件 300×300 后，余料为
//     700×1000 与 300×700；第二件 900×900 放不进现有余料 → 开新板，新板横切 900、竖切 900 可行
const nb = cutBoards({
  boardWidth: 1000, boardHeight: 1000, kerf: 0, maxCutLength: 1000,
  parts: [
    { name: '小块', width: 300, height: 300, quantity: 1 },
    { name: '大块', width: 900, height: 900, quantity: 1 },
  ],
});
assert.strictEqual(nb.boardsCount, 2, '现有板放不下应开新板');
assert(nb.boards[1].longestCut <= 1000 + 1e-6);

// 23) 上限逐板生效：所有板的所有刀长都不得超过上限
const ml = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 3, maxCutLength: 800,
  orders: [
    { orderNo: 'A', parts: [{ name: '块', width: 400, height: 300, quantity: 5 }] },
    { orderNo: 'B', parts: [{ name: '条', width: 500, height: 200, quantity: 4 }] },
  ],
});
for (const b of ml.boards) {
  for (const c of b.cuts) {
    assert(c.length <= 800 + 1e-6,
      `板 ${b.index} 第 ${c.seq} 刀长 ${c.length} 超过上限 800`);
  }
}
// 面积守恒、零件不重叠仍成立
for (const b of ml.boards) {
  assert(Math.abs(b.width * b.height - b.partsArea - b.kerfArea - b.remainderArea) < 0.01);
  const ps = b.placements;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j];
      const overlap = a.x < c.x + c.w - 1e-6 && c.x < a.x + a.w - 1e-6 &&
        a.y < c.y + c.h - 1e-6 && c.y < a.y + a.h - 1e-6;
      assert(!overlap, `板 ${b.index} 零件重叠`);
    }
  }
}

// 24) 缺件补切同样受上限约束；原方案 / 补切方案均回显上限，超限则报错且不产出刀路
const rcBase = {
  boardWidth: 1200, boardHeight: 800, kerf: 0, maxCutLength: 800,
  orders: [
    { orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
    { orderNo: 'B', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] },
  ],
};
const rcLim = recutBoards({
  ...rcBase,
  damaged: [
    { order: 'B', part: '块', index: 2 },
    { order: 'A', part: '块', index: 5 },
  ],
});
assert.strictEqual(rcLim.original.maxCutLength, 800);
assert.strictEqual(rcLim.recut.maxCutLength, 800);
for (const b of rcLim.recut.boards) {
  for (const c of b.cuts) assert(c.length <= 800 + 1e-6, `补切板刀长 ${c.length} 超限`);
}
// 补切新板也无法加工 → 报错且包含三元身份
try {
  recutBoards({
    boardWidth: 600, boardHeight: 500, kerf: 0, maxCutLength: 400,
    orders: [{ orderNo: 'R', parts: [{ name: '横条', width: 550, height: 450, quantity: 1 }] }],
    damaged: [{ order: 'R', part: '横条', index: 1 }],
  });
  assert.fail('补切超刀长应报错');
} catch (e) {
  assert(e instanceof UserError);
  assert(/R/.test(e.message) && /横条/.test(e.message) && /第 1 件/.test(e.message),
    '补切超限错误应指出订单 / 零件 / 件号：' + e.message);
}

// 25) 临时余板库存：已开板优先 → 未用余板（按输入顺序）→ 标准新板；余板最多用一次
const stBase = {
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 100,
  stockBoards: [
    { id: 'S1', width: 700, height: 500 },
    { id: 'S2', width: 1200, height: 800 },
  ],
  orders: [{ orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 10 }] }],
};
const st = cutBoards(stBase);
// 第1件无已开板 → 先开余板 S1（仅放1件）；第2件 S1 余料放不下 → 开余板 S2（放4件）；
// 之后才开标准新板 2 张（4+1 件）
assert.strictEqual(st.boardsCount, 4);
assert.strictEqual(st.standardBoardsCount, 2);
assert.deepStrictEqual(st.boards.map((b) => [b.kind, b.stockId || null, b.placements.length]),
  [['stock', 'S1', 1], ['stock', 'S2', 4], ['standard', null, 4], ['standard', null, 1]]);
assert.deepStrictEqual(st.stockUsed.map((s) => [s.id, s.board]), [['S1', 1], ['S2', 2]]);
assert.deepStrictEqual(st.stockUnused, []);
// 材料费只对新增标准板收取（2 × 100 元）
assert.strictEqual(st.totalMaterialCents, 20000);
assert.deepStrictEqual(st.boards.map((b) => b.cost.priceCents), [0, 0, 10000, 10000]);
// 总面积按各板实际尺寸：700×500 + 1200×800×3
assert.strictEqual(st.totalArea, 700 * 500 + 1200 * 800 * 3);
for (const b of st.boards) {
  assert(Math.abs(b.width * b.height - b.partsArea - b.kerfArea - b.remainderArea) < 0.01,
    `板 ${b.index} 面积不守恒`);
  assert.strictEqual(b.width, b.kind === 'stock' && b.stockId === 'S1' ? 700 : 1200);
  assert.strictEqual(b.height, b.kind === 'stock' && b.stockId === 'S1' ? 500 : 800);
}
// 回显库存输入
assert.deepStrictEqual(st.stockBoards, [
  { id: 'S1', width: 700, height: 500 },
  { id: 'S2', width: 1200, height: 800 },
]);

// 26) 已开板（含已启用余板）的可用矩形优先于新余板：小料填入 S1 余料，不再开新板
const reuse = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 100,
  stockBoards: [{ id: 'R1', width: 700, height: 500 }],
  orders: [{ orderNo: 'A', parts: [
    { name: '大块', width: 600, height: 400, quantity: 1 },
    { name: '小条', width: 80, height: 400, quantity: 1 }, // 可入 S1 右侧 100×500 余料
  ] }],
});
assert.strictEqual(reuse.boardsCount, 1, '应复用已启用余板');
assert.strictEqual(reuse.boards[0].kind, 'stock');
assert.strictEqual(reuse.boards[0].placements.length, 2);
assert.strictEqual(reuse.standardBoardsCount, 0);
assert.strictEqual(reuse.totalMaterialCents, 0);

// 27) 按输入顺序尝试余板，跳过放不下的；放不下的保留为未用
const skip = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 50,
  stockBoards: [
    { id: 'T1', width: 300, height: 300 }, // 放不下 600×400
    { id: 'T2', width: 1000, height: 500 }, // 可以
  ],
  orders: [{ orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 1 }] }],
});
assert.strictEqual(skip.boardsCount, 1);
assert.strictEqual(skip.boards[0].stockId, 'T2');
assert.deepStrictEqual(skip.stockUsed.map((s) => s.id), ['T2']);
assert.deepStrictEqual(skip.stockUnused.map((s) => s.id), ['T1']);
assert.strictEqual(skip.totalMaterialCents, 0);

// 28) 每块余板最多使用一次：2 件 + 1 块只能放 1 件的余板 → 余板 1 张 + 标准新板 1 张
const once = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 80,
  stockBoards: [{ id: 'U1', width: 700, height: 500 }], // 余料窄条放不进第二件 600×400
  orders: [{ orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 2 }] }],
});
assert.strictEqual(once.boardsCount, 2);
assert.strictEqual(once.boards[0].kind, 'stock');
assert.strictEqual(once.boards[1].kind, 'standard');
assert.strictEqual(once.standardBoardsCount, 1);
assert.strictEqual(once.totalMaterialCents, 8000);

// 29) 余板允许旋转落料：零件 1000×700 正向放不下 800×1100，旋转后 700×1000 可以
const stRot = cutBoards({
  boardWidth: 600, boardHeight: 600, kerf: 0,
  stockBoards: [{ id: 'Q1', width: 800, height: 1100 }],
  orders: [{ orderNo: 'A', parts: [{ name: '横条', width: 1000, height: 700, quantity: 1 }] }],
});
assert.strictEqual(stRot.boardsCount, 1);
assert.strictEqual(stRot.boards[0].stockId, 'Q1');
assert.strictEqual(stRot.boards[0].placements[0].rotated, true);

// 30) 单刀长度限制：跳过超限余板，选后续可行余板；都不可行才开标准新板
const stLim = cutBoards({
  boardWidth: 1000, boardHeight: 800, kerf: 3, boardPrice: 100, maxCutLength: 700,
  stockBoards: [
    { id: 'L1', width: 1000, height: 800 }, // 与标准板同尺寸：600×300 两种切法最短也需 800 刀 → 超限
    { id: 'L2', width: 603, height: 303 },  // 恰好容纳 600×300，竖切 303、横切 600 均 ≤ 700
  ],
  orders: [{ orderNo: 'A', parts: [{ name: 'a', width: 600, height: 300, quantity: 1 }] }],
});
assert.strictEqual(stLim.boardsCount, 1);
assert.strictEqual(stLim.boards[0].stockId, 'L2');
assert.deepStrictEqual(stLim.stockUsed.map((s) => s.id), ['L2']);
assert.deepStrictEqual(stLim.stockUnused.map((s) => s.id), ['L1']);
assert(stLim.boards[0].longestCut <= 700 + 1e-6);
assert.strictEqual(stLim.totalMaterialCents, 0);
// 所有余板均超限时回退标准新板（标准板同样超限则整体报错）
const stLimStd = cutBoards({
  boardWidth: 603, boardHeight: 303, kerf: 3, maxCutLength: 700,
  stockBoards: [{ id: 'L3', width: 1000, height: 800 }],
  orders: [{ orderNo: 'A', parts: [{ name: 'a', width: 600, height: 300, quantity: 1 }] }],
});
assert.strictEqual(stLimStd.boards[0].kind, 'standard');
assert.deepStrictEqual(stLimStd.stockUnused.map((s) => s.id), ['L3']);
assert.strictEqual(stLimStd.totalMaterialCents, stLimStd.boardPrice * 100);
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 800, kerf: 3, maxCutLength: 700,
  stockBoards: [{ id: 'L4', width: 1000, height: 800 }],
  orders: [{ orderNo: 'A', parts: [{ name: 'a', width: 600, height: 300, quantity: 1 }] }],
}), UserError);

// 31) 余板库存输入校验：编号缺失 / 重复、尺寸非正
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  stockBoards: [{ width: 10, height: 10 }],
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '余板缺编号应报错');
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  stockBoards: [
    { id: 'DUP', width: 10, height: 10 },
    { id: 'DUP', width: 20, height: 20 },
  ],
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '余板编号重复应报错');
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  stockBoards: [{ id: 'Z', width: 0, height: 10 }],
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '余板长度非正应报错');
assert.throws(() => cutBoards({
  boardWidth: 1000, boardHeight: 1000,
  stockBoards: [{ id: 'Z', width: 10, height: -2 }],
  orders: [{ orderNo: 'X', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
}), UserError, '余板宽度非正应报错');

// 32) 零件旋转后仍大于标准板、但能放入某块余板时允许排料；标准板与所有余板都放不下才报错
const onlyStock = cutBoards({
  boardWidth: 500, boardHeight: 300, kerf: 0,
  stockBoards: [{ id: 'BIG', width: 700, height: 700 }],
  orders: [{ orderNo: 'A', parts: [{ name: '大方', width: 600, height: 600, quantity: 1 }] }],
});
assert.strictEqual(onlyStock.boards[0].stockId, 'BIG');
assert.throws(() => cutBoards({
  boardWidth: 500, boardHeight: 300, kerf: 0,
  stockBoards: [{ id: 'SMALL', width: 400, height: 400 }],
  orders: [{ orderNo: 'A', parts: [{ name: '大方', width: 600, height: 600, quantity: 1 }] }],
}), UserError);

// 33) 补切独立使用标准新板，不耗用余板库存；原方案 / 补切材料费只数标准板
const rcSt = recutBoards({
  ...stBase,
  damaged: [{ order: 'A', part: '块', index: 1 }],
});
assert.deepStrictEqual(rcSt.original, cutBoards(stBase));
assert.strictEqual(rcSt.recut.addedBoards, 1);
assert.strictEqual(rcSt.recut.addedMaterialCents, 10000);
assert.strictEqual(rcSt.recut.boards[0].kind, 'standard');
assert.strictEqual(rcSt.recut.boards[0].cost.priceCents, 10000);
for (const b of rcSt.recut.boards) assert.strictEqual(b.kind, 'standard', '补切不得使用余板');
// 原方案库存耗用不受补切影响
assert.deepStrictEqual(rcSt.original.stockUsed.map((s) => s.id), ['S1', 'S2']);

// 34) 撤单影响预览：前后方案对照、保留订单差值（整数分）、原输入不被修改
const cp = cancelPreviewBoards({ ...base, cancelOrder: 'B' });
assert.strictEqual(cp.cancelOrder, 'B');
// 撤单前与直接计算一致（3 张标准板、3000 分；A 1250、B 1750）
assert.strictEqual(cp.before.standardBoardsCount, 3);
assert.strictEqual(cp.before.totalMaterialCents, 3000);
assert.deepStrictEqual(cp.before.stockUsed, []);
assert.deepStrictEqual(cp.before.orders, [
  { order: 'A', materialCents: 1250 },
  { order: 'B', materialCents: 1750 },
]);
// 撤单后只剩 A：5 件 → 2 张标准板、2000 分
assert.strictEqual(cp.after.standardBoardsCount, 2);
assert.strictEqual(cp.after.totalMaterialCents, 2000);
assert.deepStrictEqual(cp.after.orders, [{ order: 'A', materialCents: 2000 }]);
// 被撤订单与保留订单差值（后 − 前，整数分）
assert.strictEqual(cp.cancelled.beforeCents, 1750);
assert.deepStrictEqual(cp.orders, [
  { order: 'A', beforeCents: 1250, afterCents: 2000, deltaCents: 750 },
]);
assert.strictEqual(cp.diff.standardBoards, -1);
assert.strictEqual(cp.diff.totalMaterialCents, -1000);
assert.deepStrictEqual(cp.diff.stockUsedAdded, []);
assert.deepStrictEqual(cp.diff.stockUsedRemoved, []);
// 差值守恒：保留订单差值之和 = 总额差值 + 被撤订单原分摊额
assert.strictEqual(
  cp.orders.reduce((s, o) => s + o.deltaCents, 0),
  cp.diff.totalMaterialCents + cp.cancelled.beforeCents
);
// 撤单前汇总与直接计算的方案一致（原方案不变）
const direct = cutBoards(base);
assert.strictEqual(cp.before.boardsCount, direct.boardsCount);
assert.strictEqual(cp.before.totalMaterialCents, direct.totalMaterialCents);
assert.deepStrictEqual(cp.before.stockUsed, direct.stockUsed.map((s) => s.id));

// 35) 空白订单号按原位置固定自动编号，筛除后其余订单不改名
const blankBase = {
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 10,
  orders: [
    { orderNo: '', parts: [{ name: '块', width: 600, height: 400, quantity: 2 }] }, // 订单1
    { orderNo: 'X', parts: [{ name: '块', width: 600, height: 400, quantity: 2 }] },
    { orderNo: '', parts: [{ name: '块', width: 600, height: 400, quantity: 2 }] }, // 订单3
  ],
};
const cpBlank = cancelPreviewBoards({ ...blankBase, cancelOrder: 'X' });
// 保留订单仍叫 订单1、订单3（不重新编号为 订单1、订单2）
assert.deepStrictEqual(cpBlank.orders.map((o) => o.order), ['订单1', '订单3']);
assert.deepStrictEqual(cpBlank.after.orders.map((o) => o.order), ['订单1', '订单3']);
// 原始输入不被修改（空白订单号仍为空）
assert.strictEqual(blankBase.orders[0].orderNo, '');
assert.strictEqual(blankBase.orders[2].orderNo, '');
// 也可按自动编号撤单（撤 订单3，保留 X 与 订单1）
const cpBlank2 = cancelPreviewBoards({ ...blankBase, cancelOrder: '订单3' });
assert.deepStrictEqual(cpBlank2.orders.map((o) => o.order), ['订单1', 'X']);

// 36) 撤单预览中的余板耗用对照：撤掉占用余板的订单后余板回到未用
const cpStock = cancelPreviewBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0, boardPrice: 100,
  stockBoards: [{ id: 'S9', width: 300, height: 300 }],
  orders: [
    { orderNo: 'A', parts: [{ name: '小件', width: 250, height: 250, quantity: 1 }] }, // 启用余板 S9
    { orderNo: 'B', parts: [{ name: '块', width: 600, height: 400, quantity: 1 }] },   // 标准新板
  ],
  cancelOrder: 'A',
});
assert.deepStrictEqual(cpStock.before.stockUsed, ['S9']);
assert.deepStrictEqual(cpStock.after.stockUsed, []);
assert.deepStrictEqual(cpStock.diff.stockUsedRemoved, ['S9']);
assert.deepStrictEqual(cpStock.diff.stockUsedAdded, []);
assert.strictEqual(cpStock.before.standardBoardsCount, 1);
assert.strictEqual(cpStock.after.standardBoardsCount, 1);
assert.strictEqual(cpStock.diff.totalMaterialCents, 0); // 前后都只有 1 张标准板

// 37) 撤单预览校验：只有一张订单、订单号无效、未指定订单号
assert.throws(() => cancelPreviewBoards({
  boardWidth: 1000, boardHeight: 1000,
  orders: [{ orderNo: 'ONLY', parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }] }],
  cancelOrder: 'ONLY',
}), UserError, '只有一张订单应报错');
assert.throws(() => cancelPreviewBoards({ ...base, cancelOrder: '不存在' }), UserError, '订单号无效应报错');
assert.throws(() => cancelPreviewBoards({ ...base }), UserError, '未指定订单号应报错');
assert.throws(() => cancelPreviewBoards({ ...base, cancelOrder: '  ' }), UserError, '空白订单号应报错');
// 旧版单订单输入（顶层 parts）同样视为只有一张订单
assert.throws(() => cancelPreviewBoards({
  boardWidth: 1000, boardHeight: 1000,
  parts: [{ name: 'a', width: 10, height: 10, quantity: 1 }],
  cancelOrder: '订单1',
}), UserError, '单订单旧版输入应报错');

// 38) 可回收余料清单：来自各板最终空闲矩形，面积守恒、互不重叠、不含零件与锯缝
const ocBase = {
  boardWidth: 1000, boardHeight: 500, kerf: 3, boardPrice: 10,
  orders: [{ orderNo: 'A', parts: [{ name: '板', width: 400, height: 300, quantity: 1 }] }],
};
const oc = cutBoards(ocBase);
assert.strictEqual(oc.boardsCount, 1);
// 竖切优先：右 (403,0,597,500)、下 (0,303,400,197)
assert.strictEqual(oc.offcuts.length, 2);
assert.deepStrictEqual(oc.offcuts.map((o) => o.id), ['B1-R1', 'B1-R2']);
const [ocR1, ocR2] = oc.offcuts;
assert.deepStrictEqual([ocR1.board, ocR1.region, ocR1.x, ocR1.y, ocR1.w, ocR1.h], [1, 1, 403, 0, 597, 500]);
assert.deepStrictEqual([ocR2.board, ocR2.region, ocR2.x, ocR2.y, ocR2.w, ocR2.h], [1, 2, 0, 303, 400, 197]);
assert.strictEqual(ocR1.area, 597 * 500);
assert.strictEqual(ocR2.area, 400 * 197);
// 未筛选时清单面积之和 = 该板余料面积 = 总余料面积（锯缝与零件不计入）
assert(Math.abs(oc.offcutArea - oc.boards[0].remainderArea) < 0.01);
assert(Math.abs(oc.offcutArea - oc.remainderArea) < 0.01);
// 余料区域两两不重叠，且不与零件占位、锯缝带重叠
const rectOverlap = (a, b) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 &&
  a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
for (const b of oc.boards) {
  const rects = oc.offcuts.filter((o) => o.board === b.index);
  for (const p of b.placements) {
    for (const o of rects) assert(!rectOverlap(o, p), `板 ${b.index} 余料与零件重叠`);
  }
  for (const c of b.cuts) {
    if (c.band.w <= 0 || c.band.h <= 0) continue; // 零宽缝带无面积
    for (const o of rects) assert(!rectOverlap(o, c.band), `板 ${b.index} 余料与锯缝带重叠`);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert(!rectOverlap(rects[i], rects[j]), `板 ${b.index} 余料区域互相重叠`);
    }
  }
}
// 回显筛选参数（未设置时为 0，表示不筛选）
assert.strictEqual(oc.minOffcutLength, 0);
assert.strictEqual(oc.minOffcutWidth, 0);

// 39) 余料筛选：可配置最小长 / 宽（允许旋转匹配）；区域序号稳定、不随筛选变化
const ocFilter = cutBoards({ ...ocBase, minOffcutLength: 500, minOffcutWidth: 100 });
// R1 597×500 满足；R2 400×197 两个朝向的长边均 < 500 → 仅 B1-R1
assert.deepStrictEqual(ocFilter.offcuts.map((o) => o.id), ['B1-R1']);
assert.strictEqual(ocFilter.minOffcutLength, 500);
assert.strictEqual(ocFilter.minOffcutWidth, 100);
assert(Math.abs(ocFilter.offcutArea - 597 * 500) < 0.01);
// 放宽筛选后 R2 重新入列且编号不变（区域序号为板内空闲区域顺序号）
const ocFilter2 = cutBoards({ ...ocBase, minOffcutLength: 100, minOffcutWidth: 100 });
assert.deepStrictEqual(ocFilter2.offcuts.map((o) => o.id), ['B1-R1', 'B1-R2']);
// 旋转匹配：竖条 300×800，不旋转时宽 300 < 400 不满足，旋转后 800×300 满足
const ocRot = cutBoards({
  boardWidth: 500, boardHeight: 800, kerf: 0,
  minOffcutLength: 400, minOffcutWidth: 250,
  parts: [{ name: '小块', width: 200, height: 200, quantity: 1 }],
});
// 竖切优先：右 (200,0,300,800) 入选；下 (0,200,200,600) 旋转后宽 200 < 250 仍不满足
assert.deepStrictEqual(ocRot.offcuts.map((o) => [o.id, o.w, o.h]), [['B1-R1', 300, 800]]);
// 筛选参数校验：负数 / 非数字报错
assert.throws(() => cutBoards({ ...ocBase, minOffcutLength: -1 }), UserError, '负最小长度应报错');
assert.throws(() => cutBoards({ ...ocBase, minOffcutWidth: 'abc' }), UserError, '非数字最小宽度应报错');

// 40) 余板库存板同样提取余料；多板编号按板号区分
const ocStock = cutBoards({
  boardWidth: 1200, boardHeight: 800, kerf: 0,
  stockBoards: [{ id: 'S1', width: 700, height: 500 }],
  orders: [{ orderNo: 'A', parts: [{ name: '块', width: 600, height: 400, quantity: 5 }] }],
});
// 板1 = 余板 S1（1 件），板2 = 标准板（4 件）
assert.strictEqual(ocStock.boards[0].kind, 'stock');
for (const o of ocStock.offcuts) {
  const b = ocStock.boards[o.board - 1];
  assert(o.x >= -1e-6 && o.y >= -1e-6 && o.x + o.w <= b.width + 1e-6 && o.y + o.h <= b.height + 1e-6,
    `余料 ${o.id} 越出板 ${o.board}`);
}
const ocByBoard = new Map();
for (const o of ocStock.offcuts) ocByBoard.set(o.board, (ocByBoard.get(o.board) || 0) + o.area);
for (const b of ocStock.boards) {
  assert(Math.abs((ocByBoard.get(b.index) || 0) - b.remainderArea) < 0.01,
    `板 ${b.index} 余料清单面积与余料面积不一致`);
}
// 41) 补切重算的原方案同样携带余料清单，且与直接计算一致（落位 / 分摊不受影响）
const rcOc = recutBoards({ ...ocBase, damaged: [{ order: 'A', part: '板', index: 1 }] });
assert.deepStrictEqual(rcOc.original.offcuts, oc.offcuts);
assert.deepStrictEqual(rcOc.original.boards, oc.boards);

console.log('全部算法自检通过 ✔');
