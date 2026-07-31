import { useMemo } from "react";
import { Graph, layout } from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { BrainCircuit, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

import "@xyflow/react/dist/style.css";

import type { ArticleMindMap } from "../../../lib/types";
import { Button } from "../../ui/button";
import { ReaderDialog } from "./ReaderDialog";

interface MindMapNodeData extends Record<string, unknown> {
  label: string;
  detail: string;
  kind: string;
  root: boolean;
}

type MindMapFlowNode = Node<MindMapNodeData, "mindMap">;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;

const nodeTypes = {
  mindMap: MindMapNodeView,
};

export function ArticleMindMapDialog({
  open,
  articleTitle,
  mindMap,
  loading,
  generating,
  error,
  onClose,
  onGenerate,
  onConfigure,
}: {
  open: boolean;
  articleTitle: string;
  mindMap: ArticleMindMap | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  onClose: () => void;
  onGenerate: () => void;
  onConfigure: () => void;
}) {
  const flow = useMemo(() => layoutMindMap(mindMap), [mindMap]);
  const busy = loading || generating;

  return (
    <ReaderDialog
      open={open}
      title="文章思维导图"
      description={mindMap ? mindMap.title : `梳理“${articleTitle}”的概念、论点与关系`}
      width="max-w-[1040px]"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            关闭
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={onConfigure}>
            AI 设置
          </Button>
          <Button size="sm" disabled={busy} onClick={onGenerate}>
            {generating ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : mindMap ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? "生成中..." : mindMap ? "重新生成" : "生成思维导图"}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-card border border-line bg-panel/70">
        {loading ? (
          <MindMapLoading label="正在读取本地思维导图" />
        ) : generating ? (
          <MindMapLoading label="AI 正在梳理文章结构" />
        ) : mindMap && flow.nodes.length > 0 ? (
          <div className="relative h-[min(62vh,620px)] min-h-[420px] bg-white">
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-line bg-white/95 px-2.5 py-1.5 text-[9px] text-muted shadow-sm">
              <BrainCircuit className="h-3.5 w-3.5 text-accent" />
              <span>{mindMap.nodes.length} 个节点</span>
              <span className="h-3 w-px bg-line" />
              <span>{mindMap.edges.length} 条关系</span>
              <span className="h-3 w-px bg-line" />
              <span>{formatUpdatedAt(mindMap.updated_at)}</span>
            </div>
            <ReactFlow<MindMapFlowNode, Edge>
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
              minZoom={0.3}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
              className="[&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-md [&_.react-flow__controls]:border [&_.react-flow__controls]:border-line [&_.react-flow__controls]:shadow-sm [&_.react-flow__controls-button]:border-line [&_.react-flow__controls-button]:bg-white [&_.react-flow__controls-button]:text-ink-2"
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d1d5db" />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-accent">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[13px] font-semibold text-ink">尚未生成思维导图</p>
            <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-muted">
              AI 将根据当前文章正文或来源摘要提取主题、论点和关联。结果只在你点击生成后创建，并保存在本机。
            </p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </ReaderDialog>
  );
}

function MindMapNodeView({ data }: NodeProps<MindMapFlowNode>) {
  return (
    <div
      className={
        data.root
          ? "w-[220px] rounded-card border border-indigo-300 bg-indigo-50 px-3 py-2.5 shadow-card"
          : "w-[220px] rounded-card border border-line bg-white px-3 py-2.5 shadow-sm"
      }
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-indigo-300" />
      <div className="flex items-center gap-2">
        <span className={data.root ? "h-1.5 w-1.5 rounded-full bg-accent" : "h-1.5 w-1.5 rounded-full bg-emerald-500"} />
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink" title={data.label}>
          {data.label}
        </p>
        <span className="max-w-[72px] truncate rounded bg-panel px-1.5 py-0.5 text-[8px] font-medium text-muted">
          {data.kind}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[9px] leading-4 text-muted" title={data.detail}>
        {data.detail || "暂无补充说明"}
      </p>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-indigo-300" />
    </div>
  );
}

function MindMapLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
      <p className="mt-3 text-[12px] font-semibold text-ink-2">{label}</p>
      <p className="mt-1 text-[10px] text-faint">请保持窗口打开</p>
    </div>
  );
}

function layoutMindMap(mindMap: ArticleMindMap | null): { nodes: MindMapFlowNode[]; edges: Edge[] } {
  if (!mindMap) return { nodes: [], edges: [] };

  const graph = new Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 92, nodesep: 30, marginx: 28, marginy: 28 });
  for (const node of mindMap.nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of mindMap.edges) {
    graph.setEdge(edge.source, edge.target);
  }
  layout(graph);

  const incoming = new Set(mindMap.edges.map((edge) => edge.target));
  const nodes: MindMapFlowNode[] = mindMap.nodes.map((node, index) => {
    const position = graph.node(node.id) as { x?: number; y?: number } | undefined;
    return {
      id: node.id,
      type: "mindMap",
      position: {
        x: (position?.x ?? index * (NODE_WIDTH + 80)) - NODE_WIDTH / 2,
        y: (position?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        label: node.label,
        detail: node.detail,
        kind: node.kind,
        root: !incoming.has(node.id),
      },
    };
  });
  const edges: Edge[] = mindMap.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.label || undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#a5b4fc", width: 14, height: 14 },
    style: { stroke: "#a5b4fc", strokeWidth: 1.4 },
    labelStyle: { fill: "#6b7280", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges };
}

function formatUpdatedAt(timestamp: number) {
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(milliseconds);
}
