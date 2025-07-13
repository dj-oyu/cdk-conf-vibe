import { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';

export interface CollaborationDoc {
  ydoc: Y.Doc;
  awareness: Y.Map<any>;
  drawingData: Y.Array<any>;
  textData: Y.Map<any>;
}

export const useCollaboration = (roomId: string, userId: string) => {
  const [doc, setDoc] = useState<CollaborationDoc | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize Y.js document
  useEffect(() => {
    const ydoc = new Y.Doc();
    
    // Create shared data structures
    const awareness = ydoc.getMap('awareness');
    const drawingData = ydoc.getArray('drawing');
    const textData = ydoc.getMap('text');

    const collaborationDoc: CollaborationDoc = {
      ydoc,
      awareness,
      drawingData,
      textData
    };

    setDoc(collaborationDoc);
    setIsConnected(true);

    // Clean up on unmount
    return () => {
      ydoc.destroy();
      setIsConnected(false);
    };
  }, [roomId]);

  // Add drawing data
  const addDrawingData = useCallback((drawingElement: any) => {
    if (!doc) return;

    doc.drawingData.push([{
      id: `${userId}-${Date.now()}-${Math.random()}`,
      userId,
      timestamp: Date.now(),
      type: drawingElement.type,
      data: drawingElement.data,
      style: drawingElement.style
    }]);
  }, [doc, userId]);

  // Update text data
  const updateTextData = useCallback((textId: string, content: string) => {
    if (!doc) return;

    doc.textData.set(textId, {
      id: textId,
      userId,
      timestamp: Date.now(),
      content
    });
  }, [doc, userId]);

  // Update user awareness (cursor position, selection, etc.)
  const updateAwareness = useCallback((awarenessData: any) => {
    if (!doc) return;

    doc.awareness.set(userId, {
      userId,
      timestamp: Date.now(),
      cursor: awarenessData.cursor,
      selection: awarenessData.selection,
      color: awarenessData.color || '#3b82f6'
    });
  }, [doc, userId]);

  // Get all drawing elements
  const getDrawingElements = useCallback(() => {
    if (!doc) return [];
    return doc.drawingData.toArray();
  }, [doc]);

  // Get all text elements
  const getTextElements = useCallback(() => {
    if (!doc) return new Map();
    return new Map(doc.textData.entries());
  }, [doc]);

  // Get awareness data for all users
  const getAwarenessData = useCallback(() => {
    if (!doc) return new Map();
    return new Map(doc.awareness.entries());
  }, [doc]);

  // Set up listeners for real-time updates
  const [drawingElements, setDrawingElements] = useState<any[]>([]);
  const [textElements, setTextElements] = useState<Map<string, any>>(new Map());
  const [awarenessData, setAwarenessData] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (!doc) return;

    const updateDrawing = () => {
      setDrawingElements(doc.drawingData.toArray());
    };

    const updateText = () => {
      setTextElements(new Map(doc.textData.entries()));
    };

    const updateAwarenessState = () => {
      setAwarenessData(new Map(doc.awareness.entries()));
    };

    // Listen for changes
    doc.drawingData.observe(updateDrawing);
    doc.textData.observe(updateText);
    doc.awareness.observe(updateAwarenessState);

    // Initial data load
    updateDrawing();
    updateText();
    updateAwarenessState();

    return () => {
      doc.drawingData.unobserve(updateDrawing);
      doc.textData.unobserve(updateText);
      doc.awareness.unobserve(updateAwarenessState);
    };
  }, [doc]);

  // Undo/Redo functionality
  const undoManager = doc ? new Y.UndoManager([doc.drawingData, doc.textData]) : null;

  const undo = useCallback(() => {
    if (undoManager && undoManager.canUndo()) {
      undoManager.undo();
    }
  }, [undoManager]);

  const redo = useCallback(() => {
    if (undoManager && undoManager.canRedo()) {
      undoManager.redo();
    }
  }, [undoManager]);

  const canUndo = undoManager?.canUndo() || false;
  const canRedo = undoManager?.canRedo() || false;

  // Export document state
  const exportDocument = useCallback(() => {
    if (!doc) return null;

    return {
      drawing: getDrawingElements(),
      text: Object.fromEntries(getTextElements()),
      metadata: {
        roomId,
        exportedBy: userId,
        exportedAt: Date.now()
      }
    };
  }, [doc, roomId, userId, getDrawingElements, getTextElements]);

  // Import document state
  const importDocument = useCallback((documentData: any) => {
    if (!doc || !documentData) return;

    // Clear existing data
    doc.drawingData.delete(0, doc.drawingData.length);
    doc.textData.clear();

    // Import drawing data
    if (documentData.drawing && Array.isArray(documentData.drawing)) {
      documentData.drawing.forEach((element: any) => {
        doc.drawingData.push([element]);
      });
    }

    // Import text data
    if (documentData.text && typeof documentData.text === 'object') {
      Object.entries(documentData.text).forEach(([key, value]) => {
        doc.textData.set(key, value);
      });
    }
  }, [doc]);

  return {
    doc,
    isConnected,
    drawingElements,
    textElements,
    awarenessData,
    addDrawingData,
    updateTextData,
    updateAwareness,
    getDrawingElements,
    getTextElements,
    getAwarenessData,
    undo,
    redo,
    canUndo,
    canRedo,
    exportDocument,
    importDocument
  };
};