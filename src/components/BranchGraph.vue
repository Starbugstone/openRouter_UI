<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  branches: { type: Array, default: () => [] },
  activeBranchId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'clone', 'rename']);

const containerEl = ref(null);
const svgEl = ref(null);

const collapsedIds = ref(new Set());
const zoomTransform = ref(d3.zoomIdentity);
const hasUserMoved = ref(false);

let resizeObserver = null;
let svgSel = null;
let viewportSel = null;
let linksSel = null;
let nodesSel = null;
let zoomBehavior = null;

const toggleCollapse = (id) => {
  const next = new Set(collapsedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedIds.value = next;
};

const expandAll = () => {
  collapsedIds.value = new Set();
};

const collapseAll = () => {
  const out = new Set();
  const walk = (node) => {
    const children = Array.isArray(node.children) ? node.children : [];
    if (node.id && children.length) out.add(node.id);
    children.forEach(walk);
  };
  (props.branches || []).forEach(walk);
  collapsedIds.value = out;
};

const promptRename = (node) => {
  const current = node?.data?.title || '';
  const title = (window.prompt('Rename branch:', current) || '').trim();
  if (!title) return;
  emit('rename', node.data.id, title);
};

const getRootData = () => {
  if (props.branches.length === 1) return props.branches[0];
  return {
    id: '__root__',
    title: props.branches.length ? 'Branches' : 'No branches',
    parentId: null,
    updatedAt: null,
    createdAt: null,
    forkFromMessageIndex: null,
    children: props.branches
  };
};

const initSvg = () => {
  svgSel = d3.select(svgEl.value);
  svgSel.selectAll('*').remove();

  viewportSel = svgSel.append('g').attr('class', 'branch-graph-viewport');
  linksSel = viewportSel.append('g').attr('class', 'branch-graph-links');
  nodesSel = viewportSel.append('g').attr('class', 'branch-graph-nodes');

  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.25, 2.5])
    .on('zoom', (event) => {
      viewportSel.attr('transform', event.transform);
      zoomTransform.value = event.transform;
      hasUserMoved.value = true;
    });

  svgSel.call(zoomBehavior).on('dblclick.zoom', null);
};

const fitToView = (bounds, width, height) => {
  const pad = 24;
  const contentW = Math.max(1, bounds.maxX - bounds.minX);
  const contentH = Math.max(1, bounds.maxY - bounds.minY);
  const sx = (width - pad * 2) / contentW;
  const sy = (height - pad * 2) / contentH;
  const scale = Math.max(0.25, Math.min(2.0, Math.min(sx, sy)));
  const tx = (width - contentW * scale) / 2 - bounds.minX * scale;
  const ty = (height - contentH * scale) / 2 - bounds.minY * scale;
  const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
  zoomTransform.value = t;
  svgSel.call(zoomBehavior.transform, t);
};

const render = () => {
  if (!containerEl.value || !svgEl.value) return;
  if (!svgSel) initSvg();

  const { width, height } = containerEl.value.getBoundingClientRect();
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  svgSel.attr('width', w).attr('height', h);

  const rootData = getRootData();
  const hierarchy = d3.hierarchy(rootData, (d) => {
    if (!d || !Array.isArray(d.children) || !d.children.length) return null;
    if (d.id && d.id !== '__root__' && collapsedIds.value.has(d.id)) return null;
    return d.children;
  });

  const dx = 54;
  const dy = 98;
  const tree = d3.tree().nodeSize([dx, dy]);
  tree(hierarchy);

  const nodes = hierarchy.descendants();
  const links = hierarchy.links();

  const rootChildren = (hierarchy.children || []).map((c) => c.data.id);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(rootChildren);
  const groupId = (d) => d.ancestors().find((a) => a.depth === 1)?.data?.id || d.data.id;

  const xVals = nodes.map((d) => d.x);
  const yVals = nodes.map((d) => d.y);
  const minX = Math.min(...xVals) - 40;
  const maxX = Math.max(...xVals) + 320;
  const minY = Math.min(...yVals) - 60;
  const maxY = Math.max(...yVals) + 60;

  const xOff = -minX;
  const yOff = -minY;

  const at = (d) => ({ x: d.x + xOff, y: d.y + yOff });
  const linkGen = d3.linkVertical().x((d) => d.x).y((d) => d.y);

  linksSel
    .selectAll('path.branch-graph-link')
    .data(links, (d) => `${d.source.data.id}->${d.target.data.id}`)
    .join(
      (enter) => enter.append('path').attr('class', 'branch-graph-link'),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('d', (d) => linkGen({ source: at(d.source), target: at(d.target) }))
    .attr('stroke', (d) => color(groupId(d.target)) || '#3a3e47');

  const nodeSel = nodesSel.selectAll('g.branch-graph-node').data(nodes, (d) => d.data.id);

  const nodeEnter = nodeSel
    .enter()
    .append('g')
    .attr('class', 'branch-graph-node')
    .on('click', (event, d) => {
      if (event.defaultPrevented) return; // ignore click after pan/zoom drag
      if (d.data.id === '__root__') return;
      emit('select', d.data.id);
    });

  nodeEnter.append('circle').attr('r', 8).attr('class', 'branch-graph-dot');

  nodeEnter
    .append('text')
    .attr('class', 'branch-graph-label')
    .attr('x', 14)
    .attr('y', 4)
    .text((d) => d.data.title || d.data.id);

  nodeEnter
    .append('text')
    .attr('class', 'branch-graph-toggle')
    .attr('x', -16)
    .attr('y', 5)
    .on('click', (event, d) => {
      event.stopPropagation();
      const hasChildren = Array.isArray(d.data.children) && d.data.children.length > 0;
      if (!hasChildren || d.data.id === '__root__') return;
      toggleCollapse(d.data.id);
    });

  nodeEnter
    .append('text')
    .attr('class', 'branch-graph-rename')
    .attr('x', 14)
    .attr('y', 22)
    .on('click', (event, d) => {
      event.stopPropagation();
      if (d.data.id === '__root__') return;
      promptRename(d);
    })
    .text('Rename');

  const nodeMerge = nodeEnter.merge(nodeSel);

  nodeMerge.attr('transform', (d) => {
    const p = at(d);
    return `translate(${p.x},${p.y})`;
  });

  nodeMerge
    .select('circle.branch-graph-dot')
    .attr('stroke', (d) => {
      if (d.data.id === props.activeBranchId) return '#2d7cff';
      return color(groupId(d)) || '#3a3e47';
    })
    .attr('stroke-width', (d) => (d.data.id === props.activeBranchId ? 3 : 2))
    .attr('fill', (d) => (d.data.id === props.activeBranchId ? '#0b1a33' : '#0b0c10'));

  nodeMerge
    .select('text.branch-graph-label')
    .classed('active', (d) => d.data.id === props.activeBranchId)
    .text((d) => d.data.title || d.data.id);

  nodeMerge
    .select('text.branch-graph-toggle')
    .text((d) => {
      const hasChildren = Array.isArray(d.data.children) && d.data.children.length > 0;
      if (!hasChildren || d.data.id === '__root__') return '';
      return collapsedIds.value.has(d.data.id) ? '▸' : '▾';
    });

  nodeMerge
    .select('text.branch-graph-rename')
    .style('display', (d) => (d.data.id === '__root__' ? 'none' : 'block'));

  nodeSel.exit().remove();

  if (!hasUserMoved.value) {
    fitToView({ minX: 0, minY: 0, maxX: maxX - minX, maxY: maxY - minY }, w, h);
  } else {
    svgSel.call(zoomBehavior.transform, zoomTransform.value);
  }
};

onMounted(async () => {
  await nextTick();
  initSvg();
  render();
  resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(containerEl.value);
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = null;
});

watch(
  [() => props.branches, () => props.activeBranchId, () => collapsedIds.value],
  async () => {
    await nextTick();
    render();
  },
  { deep: true }
);

const resetView = async () => {
  hasUserMoved.value = false;
  await nextTick();
  render();
};
</script>

<template>
  <div class="branch-panel">
    <div class="branch-header">
      <h3>Branches</h3>
      <div class="branch-graph-actions">
        <button class="btn secondary btn-compact" @click="emit('clone')">Clone branch</button>
        <button class="btn secondary btn-compact" @click="collapseAll" title="Collapse all">Collapse</button>
        <button class="btn secondary btn-compact" @click="expandAll" title="Expand all">Expand</button>
        <button class="btn secondary btn-compact" @click="resetView" title="Fit to view">Reset view</button>
      </div>
    </div>

    <div class="branch-graph-hint muted small">
      Drag to pan • Scroll to zoom • Click ▾ to collapse
    </div>

    <div ref="containerEl" class="branch-graph-canvas">
      <svg ref="svgEl" class="branch-graph-svg" role="img" aria-label="Branch tree"></svg>
    </div>
  </div>
</template>
