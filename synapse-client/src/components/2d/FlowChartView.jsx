import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useSynapseStore from '../../store/useSynapseStore';
import { fetchSynapseExpansion } from '../../api/synapseApi';
import { getSafePosition } from '../../utils/coordinateHelper';

const FlowChartContent = () => {
  const storeNodes = useSynapseStore((s) => s.nodes);
  const storeEdges = useSynapseStore((s) => s.edges);
  const addMergedNodes = useSynapseStore((s) => s.addMergedNodes);
  const setIsExpanding = useSynapseStore((s) => s.setIsExpanding);
  const setSelectedNode = useSynapseStore((s) => s.setSelectedNode);
  const selectedNode = useSynapseStore((s) => s.selectedNode);
  
  const { fitView } = useReactFlow();

  // Map 3D nodes to 2D React Flow nodes
  const initialNodes = useMemo(() => {
    return storeNodes.map((n) => ({
      id: n.id,
      position: { x: n.position.x * 80, y: n.position.y * 80 },
      data: { label: n.label, ...n },
      style: {
        background: 'rgba(5, 5, 5, 0.8)',
        color: '#fff',
        border: `2px solid ${n.color || '#fff'}`,
        borderRadius: '8px',
        padding: '10px 20px',
        boxShadow: n.id === selectedNode?.id ? `0 0 15px ${n.color}` : 'none',
        fontWeight: n.level === 0 ? 'bold' : 'normal',
      }
    }));
  }, [storeNodes, selectedNode]);

  const initialEdges = useMemo(() => {
    return storeEdges.map((e, index) => ({
      id: `e-${e.source}-${e.target}-${index}`,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 2 }
    }));
  }, [storeEdges]);

  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );
  
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data);
  }, [setSelectedNode]);

  const onPaneDoubleClick = useCallback(() => {
    // Gracefully pan to fit all nodes instead of zooming in blindly
    fitView({ duration: 800, padding: 0.2 });
  }, [fitView]);

  const onNodeDoubleClick = useCallback(async (event, node) => {
    const nodeToExpand = node.data;
    console.log(`🌌 Infinite Expansion triggered on (2D): "${nodeToExpand.label}"`);
    setIsExpanding(true);

    try {
      const safePos = getSafePosition(nodeToExpand);
      const result = await fetchSynapseExpansion(nodeToExpand.id, nodeToExpand.label, safePos);

      const { nodes: rawNodes, edges: rawEdges } = result;
      const stamp = `expand-${Date.now()}`;

      const offsetNodes = rawNodes.map((n) => {
        const pos = getSafePosition(n);
        return {
          ...n,
          id: `${stamp}-${n.id}`,
          level: Math.min((n.level ?? 2), 2),
          position: {
            x: safePos.x + pos.x * 0.5,
            y: safePos.y + pos.y * 0.5,
            z: safePos.z + pos.z * 0.5,
          },
        };
      });

      const idMap = new Map(rawNodes.map((n, i) => [n.id, offsetNodes[i].id]));
      const offsetEdges = rawEdges
        .map((e) => ({
          source: e.source === nodeToExpand.id ? nodeToExpand.id : idMap.get(e.source),
          target: idMap.get(e.target),
        }))
        .filter((e) => e.source && e.target);

      addMergedNodes(offsetNodes, offsetEdges);
      
      // Give the new nodes a moment to render, then smoothly pan to fit them
      setTimeout(() => {
        fitView({ duration: 800, padding: 0.2 });
      }, 100);

    } catch (err) {
      console.error("❌ Expansion fetch failed:", err.message);
    } finally {
      setIsExpanding(false);
    }
  }, [addMergedNodes, setIsExpanding, fitView]);

  const onNodeDragStop = useCallback((event, draggedNode) => {
    const fusionThreshold = 100; 
    
    const targetNode = nodes.find((n) => {
      if (n.id === draggedNode.id) return false;
      const dx = n.position.x - draggedNode.position.x;
      const dy = n.position.y - draggedNode.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < fusionThreshold;
    });

    if (targetNode) {
      console.log(`🔥 Synaptic Fusion in 2D! Merging "${draggedNode.data.label}" into "${targetNode.data.label}"`);
      
      const newEdge = {
        source: draggedNode.id,
        target: targetNode.id,
        id: `fused-${draggedNode.id}-${targetNode.id}`,
      };

      const draggedIndex = storeNodes.findIndex(n => n.id === draggedNode.id);
      const targetIndex = storeNodes.findIndex(n => n.id === targetNode.id);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const updatedNodes = [...storeNodes];
        updatedNodes[draggedIndex] = { ...updatedNodes[draggedIndex], level: 3, color: '#f59e0b' };
        
        updatedNodes[draggedIndex].position = {
          x: (updatedNodes[draggedIndex].position.x + updatedNodes[targetIndex].position.x) / 2,
          y: (updatedNodes[draggedIndex].position.y + updatedNodes[targetIndex].position.y) / 2,
          z: (updatedNodes[draggedIndex].position.z + updatedNodes[targetIndex].position.z) / 2,
        };

        addMergedNodes([], [newEdge]);
      }
    }
  }, [nodes, storeNodes, storeEdges, addMergedNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneDoubleClick={onPaneDoubleClick}
      onNodeDragStop={onNodeDragStop}
      zoomOnDoubleClick={false}
      fitView
    >
      {nodes.length > 0 && (
        <>
          <Controls style={{ background: '#111', color: '#fff', fill: '#fff', borderColor: '#333' }} />
          <MiniMap nodeStrokeColor={(n) => n.data.color || '#fff'} nodeColor="#111" maskColor="rgba(0,0,0,0.7)" />
        </>
      )}
      <Background color="#333" gap={16} size={1} />
    </ReactFlow>
  );
};

const FlowChartView = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <FlowChartContent />
      </ReactFlowProvider>
    </div>
  );
};

export default FlowChartView;
