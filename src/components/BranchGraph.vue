<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  branches: { type: Array, default: () => [] },
  activeBranchId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'clone', 'rename', 'move']);

const containerEl = ref(null);
const svgEl = ref(null);

const collapsedIds = ref(new Set());
const zoomTransform = ref(d3.zoomIdentity);
const hasUserMoved = ref(false);

/**
 * Per-instance (non-reactive) state for D3/DOM handles.
 * Kept in a factory to guarantee no cross-instance sharing.
 */
const createGraphState = () => ({
  resizeObserver: null,
  svgSel: null,
  viewportSel: null,
  linksSel: null,
  nodesSel: null,
  zoomBehavior: null,
  localOffsets: new Map(), // branchId -> { dx, dy }
  dragState: null,
  rafPending: false
});

const graphState = createGraphState();

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

const getOwnOffset = (data) => {
  if (!data || !data.id || data.id === '__root__') return { dx: 0, dy: 0 };
  const local = graphState.localOffsets.get(data.id);
  if (local) return local;
  const ui = data.ui && typeof data.ui === 'object' ? data.ui : null;
  return {
    dx: Number.isFinite(ui?.dx) ? ui.dx : 0,
    dy: Number.isFinite(ui?.dy) ? ui.dy : 0
  };
};

const setOwnOffset = (id, dx, dy) => {
  if (!id || id === '__root__') return;
  graphState.localOffsets.set(id, { dx, dy });
};

const scheduleRender = () => {
  if (graphState.rafPending) return;
  graphState.rafPending = true;
  requestAnimationFrame(() => {
    graphState.rafPending = false;
    render();
  });
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
  graphState.svgSel = d3.select(svgEl.value);
  graphState.svgSel.selectAll('*').remove();

  graphState.viewportSel = graphState.svgSel.append('g').attr('class', 'branch-graph-viewport');
  graphState.linksSel = graphState.viewportSel.append('g').attr('class', 'branch-graph-links');
  graphState.nodesSel = graphState.viewportSel.append('g').attr('class', 'branch-graph-nodes');

  graphState.zoomBehavior = d3
    .zoom()
    .scaleExtent([0.25, 2.5])
    .on('zoom', (event) => {
      graphState.viewportSel.attr('transform', event.transform);
      zoomTransform.value = event.transform;
      hasUserMoved.value = true;
    });

  graphState.svgSel.call(graphState.zoomBehavior).on('dblclick.zoom', null);
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
  graphState.svgSel.call(graphState.zoomBehavior.transform, t);
};

const render = () => {
  if (!containerEl.value || !svgEl.value) return;
  if (!graphState.svgSel) initSvg();

  const { width, height } = containerEl.value.getBoundingClientRect();
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  graphState.svgSel.attr('width', w).attr('height', h);

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

  // Apply cumulative offsets (so dragging a node moves its whole subtree).
  hierarchy.eachBefore((node) => {
    const parentDx = node.parent ? node.parent._cumDx || 0 : 0;
    const parentDy = node.parent ? node.parent._cumDy || 0 : 0;
    const own = getOwnOffset(node.data);
    node._cumDx = parentDx + own.dx;
    node._cumDy = parentDy + own.dy;
  });

  const xVals = [];
  const yVals = [];
  nodes.forEach((d) => {
    const x = d.x + (d._cumDx || 0);
    const y = d.y + (d._cumDy || 0);
    xVals.push(x);
    yVals.push(y);
  });
  const minX = Math.min(...xVals) - 40;
  const maxX = Math.max(...xVals) + 320;
  const minY = Math.min(...yVals) - 60;
  const maxY = Math.max(...yVals) + 60;

  const xOff = -minX;
  const yOff = -minY;

  const at = (d) => ({
    x: d.x + xOff + (d._cumDx || 0),
    y: d.y + yOff + (d._cumDy || 0)
  });
  const linkGen = d3.linkVertical().x((d) => d.x).y((d) => d.y);

  graphState.linksSel
    .selectAll('path.branch-graph-link')
    .data(links, (d) => `${d.source.data.id}->${d.target.data.id}`)
    .join(
      (enter) => enter.append('path').attr('class', 'branch-graph-link'),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('d', (d) => linkGen({ source: at(d.source), target: at(d.target) }))
    .attr('stroke', (d) => color(groupId(d.target)) || '#3a3e47');

  const nodeSel = graphState.nodesSel.selectAll('g.branch-graph-node').data(nodes, (d) => d.data.id);

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

  nodeMerge.call(
    d3
      .drag()
      .on('start', (event, d) => {
        if (d.data.id === '__root__') return;
        hasUserMoved.value = true;
        event.sourceEvent?.stopPropagation();
        if (!event.sourceEvent) return;
        const [sx, sy] = d3.pointer(event.sourceEvent, svgEl.value);
        const [gx, gy] = zoomTransform.value.invert([sx, sy]);
        const own = getOwnOffset(d.data);
        graphState.dragState = {
          id: d.data.id,
          startDx: own.dx,
          startDy: own.dy,
          startPx: gx,
          startPy: gy
        };
      })
      .on('drag', (event, d) => {
        if (!graphState.dragState || d.data.id !== graphState.dragState.id) return;
        event.sourceEvent?.stopPropagation();
        if (!event.sourceEvent) return;
        const [sx, sy] = d3.pointer(event.sourceEvent, svgEl.value);
        const [gx, gy] = zoomTransform.value.invert([sx, sy]);
        const dx = graphState.dragState.startDx + (gx - graphState.dragState.startPx);
        const dy = graphState.dragState.startDy + (gy - graphState.dragState.startPy);
        setOwnOffset(graphState.dragState.id, dx, dy);
        scheduleRender();
      })
      .on('end', (event, d) => {
        if (!graphState.dragState || d.data.id !== graphState.dragState.id) return;
        event.sourceEvent?.stopPropagation();
        const final = graphState.localOffsets.get(graphState.dragState.id) || {
          dx: graphState.dragState.startDx,
          dy: graphState.dragState.startDy
        };
        emit('move', graphState.dragState.id, final.dx, final.dy);
        graphState.dragState = null;
      })
  );

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
    graphState.svgSel.call(graphState.zoomBehavior.transform, zoomTransform.value);
  }
};

onMounted(async () => {
  await nextTick();
  if (!containerEl.value) return;
  initSvg();
  render();
  graphState.resizeObserver = new ResizeObserver(() => render());
  graphState.resizeObserver.observe(containerEl.value);
});

onBeforeUnmount(() => {
  if (graphState.resizeObserver) graphState.resizeObserver.disconnect();
  graphState.resizeObserver = null;
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
      Drag background to pan • Drag nodes to reposition • Scroll to zoom • Click ▾ to collapse
    </div>

    <div ref="containerEl" class="branch-graph-canvas">
      <svg ref="svgEl" class="branch-graph-svg" role="img" aria-label="Branch tree"></svg>
    </div>
  </div>
</template>
