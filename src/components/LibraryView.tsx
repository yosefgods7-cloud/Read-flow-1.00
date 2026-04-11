import React, { useState, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { PdfDocument, addPdf, deletePdf, updatePdf } from '../lib/db';
import { Upload, Trash2, Edit2, ArrowUp, ArrowDown, Star, Play, ArrowDownAZ, ArrowUpAZ, Calendar, HardDrive, ListOrdered, GripVertical, FileText, Search, X } from 'lucide-react';
import clsx from 'clsx';

interface LibraryViewProps {
  pdfs: PdfDocument[];
  onRefresh: () => void;
  onOpenPdf: (id: string) => void;
}

type Tab = 'to-read' | 'reading' | 'completed';
type SortBy = 'order' | 'name' | 'date' | 'size';
type SortOrder = 'asc' | 'desc';

export const LibraryView: React.FC<LibraryViewProps> = ({ pdfs, onRefresh, onOpenPdf }) => {
  const [activeTab, setActiveTab] = useState<Tab>('to-read');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('order');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isUploading, setIsUploading] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPdfs = pdfs
    .filter(p => p.status === activeTab)
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = a.addedAt - b.addedAt;
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'order':
      default:
        comparison = a.order - b.order;
        break;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [renameModalPdf, setRenameModalPdf] = useState<PdfDocument | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type === 'application/pdf' || files[i].name.toLowerCase().endsWith('.pdf')) {
          await addPdf(files[i]);
        }
      }
      onRefresh();
    } catch (err) {
      console.error('Error importing PDFs:', err);
      // alert('Failed to import one or more PDFs. They might be too large or corrupted.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteModalId(id);
  };

  const confirmDelete = async () => {
    if (deleteModalId) {
      await deletePdf(deleteModalId);
      setDeleteModalId(null);
      onRefresh();
    }
  };

  const handleRename = async (pdf: PdfDocument) => {
    setRenameModalPdf(pdf);
    setRenameInput(pdf.name);
  };

  const confirmRename = async () => {
    if (renameModalPdf && renameInput.trim() !== '') {
      await updatePdf(renameModalPdf.id, { name: renameInput.trim() });
      setRenameModalPdf(null);
      onRefresh();
    }
  };

  const handleTogglePriority = async (pdf: PdfDocument) => {
    await updatePdf(pdf.id, { priority: !pdf.priority });
    onRefresh();
  };

  const handleMove = async (pdf: PdfDocument, direction: 'up' | 'down') => {
    const index = filteredPdfs.findIndex(p => p.id === pdf.id);
    if (direction === 'up' && index > 0) {
      const other = filteredPdfs[index - 1];
      await updatePdf(pdf.id, { order: other.order });
      await updatePdf(other.id, { order: pdf.order });
      onRefresh();
    } else if (direction === 'down' && index < filteredPdfs.length - 1) {
      const other = filteredPdfs[index + 1];
      await updatePdf(pdf.id, { order: other.order });
      await updatePdf(other.id, { order: pdf.order });
      onRefresh();
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (sortBy !== 'order') return;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (sortBy !== 'order') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    if (sortBy !== 'order') return;
    if (dragOverId === id) {
      setDragOverId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    if (sortBy !== 'order') return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    setDragOverId(null);

    if (sourceId === targetId || !sourceId) return;

    const sourceIndex = filteredPdfs.findIndex(p => p.id === sourceId);
    const targetIndex = filteredPdfs.findIndex(p => p.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourcePdf = filteredPdfs[sourceIndex];
    const updates = [];

    if (sourceIndex < targetIndex) {
      for (let i = sourceIndex + 1; i <= targetIndex; i++) {
        updates.push(updatePdf(filteredPdfs[i].id, { order: filteredPdfs[i - 1].order }));
      }
      updates.push(updatePdf(sourcePdf.id, { order: filteredPdfs[targetIndex].order }));
    } else {
      for (let i = targetIndex; i < sourceIndex; i++) {
        updates.push(updatePdf(filteredPdfs[i].id, { order: filteredPdfs[i + 1].order }));
      }
      updates.push(updatePdf(sourcePdf.id, { order: filteredPdfs[targetIndex].order }));
    }

    await Promise.all(updates);
    onRefresh();
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ReadFlow</h1>
        
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto sm:flex-1 sm:max-w-md sm:ml-auto">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-zinc-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PDFs..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2 pl-10 pr-10 text-sm focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all placeholder:text-zinc-600"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          <div>
            <input 
              type="file" 
              multiple 
              accept="application/pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImport}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 bg-zinc-100 text-zinc-900 px-4 py-2 rounded-full font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Upload size={18} />
              {isUploading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-zinc-800 pb-2">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          {(['to-read', 'reading', 'completed'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-zinc-800/50 px-1.5 sm:px-2 py-0.5 rounded-full">
                {pdfs.filter(p => p.status === tab).length}
              </span>
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto text-xs sm:text-sm pb-2 lg:pb-0 scrollbar-hide">
          <span className="text-zinc-500 mr-1 sm:mr-2 shrink-0">Sort:</span>
          <button 
            onClick={() => toggleSort('order')}
            className={clsx("flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors shrink-0", sortBy === 'order' ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50")}
          >
            <ListOrdered size={14} />
            Order
            {sortBy === 'order' && (sortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
          </button>
          <button 
            onClick={() => toggleSort('name')}
            className={clsx("flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors shrink-0", sortBy === 'name' ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50")}
          >
            {sortOrder === 'asc' ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
            Name
          </button>
          <button 
            onClick={() => toggleSort('date')}
            className={clsx("flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors shrink-0", sortBy === 'date' ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50")}
          >
            <Calendar size={14} />
            Date
            {sortBy === 'date' && (sortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
          </button>
          <button 
            onClick={() => toggleSort('size')}
            className={clsx("flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors shrink-0", sortBy === 'size' ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50")}
          >
            <HardDrive size={14} />
            Size
            {sortBy === 'size' && (sortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {filteredPdfs.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p>No PDFs in this list.</p>
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            data={filteredPdfs}
            itemContent={(index, pdf) => (
              <div className="pb-3">
                <div 
                  draggable={sortBy === 'order'}
                  onDragStart={(e) => handleDragStart(e, pdf.id)}
                  onDragOver={(e) => handleDragOver(e, pdf.id)}
                  onDragLeave={(e) => handleDragLeave(e, pdf.id)}
                  onDrop={(e) => handleDrop(e, pdf.id)}
                  onDragEnd={handleDragEnd}
                  className={clsx(
                    "rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 group transition-all duration-200 border",
                    draggedId === pdf.id ? "opacity-40 border-zinc-600 bg-zinc-900/50 scale-[0.98]" : 
                    dragOverId === pdf.id ? "border-blue-500 bg-zinc-800/80 shadow-[0_0_15px_rgba(59,130,246,0.2)] scale-[1.01] z-10 relative" : 
                    "bg-zinc-900 border-zinc-800 hover:border-zinc-700",
                    sortBy === 'order' ? "cursor-grab active:cursor-grabbing" : ""
                  )}
                >
                  {sortBy === 'order' && (
                    <div className="hidden sm:flex items-center text-zinc-600 group-hover:text-zinc-400 transition-colors">
                      <GripVertical size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 cursor-pointer flex gap-4" onClick={() => onOpenPdf(pdf.id)}>
                    <div className="w-12 h-16 sm:w-16 sm:h-20 flex-shrink-0 bg-zinc-800 rounded overflow-hidden flex items-center justify-center shadow-sm">
                      {pdf.thumbnail ? (
                        <img src={pdf.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={24} className="text-zinc-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        {pdf.priority && <Star size={16} className="text-yellow-500 fill-yellow-500" />}
                        <h3 className="font-medium text-zinc-100 truncate">{pdf.name}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{(pdf.size / 1024 / 1024).toFixed(1)} MB</span>
                        {pdf.progress > 0 && (
                          <span className="text-zinc-400">
                            {pdf.progress.toFixed(0)}% • Page {pdf.lastPage}
                          </span>
                        )}
                      </div>
                      {pdf.progress > 0 && (
                        <div className="w-full bg-zinc-800 h-1 mt-3 rounded-full overflow-hidden">
                          <div 
                            className="bg-zinc-400 h-full rounded-full" 
                            style={{ width: `${pdf.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 transition-opacity mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-zinc-800/50 sm:border-0">
                    <button onClick={() => onOpenPdf(pdf.id)} className="p-1.5 sm:p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-full" title="Read">
                      <Play size={16} />
                    </button>
                    <button onClick={() => handleTogglePriority(pdf)} className={clsx("p-1.5 sm:p-2 rounded-full", pdf.priority ? "text-yellow-500 bg-yellow-500/10" : "text-zinc-400 hover:text-zinc-100 bg-zinc-800")} title="Priority">
                      <Star size={16} />
                    </button>
                    <button onClick={() => handleRename(pdf)} className="p-1.5 sm:p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-full" title="Rename">
                      <Edit2 size={16} />
                    </button>
                    <div className="flex flex-row sm:flex-col gap-1 mx-1">
                      <button onClick={() => handleMove(pdf, 'up')} disabled={index === 0 || sortBy !== 'order'} className="p-1 sm:p-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 bg-zinc-800 sm:bg-transparent rounded sm:rounded-none" title={sortBy !== 'order' ? "Sort by Order to move" : "Move Up"}>
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => handleMove(pdf, 'down')} disabled={index === filteredPdfs.length - 1 || sortBy !== 'order'} className="p-1 sm:p-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 bg-zinc-800 sm:bg-transparent rounded sm:rounded-none" title={sortBy !== 'order' ? "Sort by Order to move" : "Move Down"}>
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <button onClick={() => handleDelete(pdf.id)} className="p-1.5 sm:p-2 text-red-400 hover:text-red-300 bg-red-400/10 rounded-full ml-auto sm:ml-0" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Delete Modal */}
      {deleteModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-medium text-zinc-100 mb-2">Delete PDF?</h3>
            <p className="text-zinc-400 text-sm mb-6">Are you sure you want to delete this PDF? This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setDeleteModalId(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModalPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-medium text-zinc-100 mb-4">Rename PDF</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 mb-6"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenameModalPdf(null);
              }}
            />
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setRenameModalPdf(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRename}
                className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 hover:bg-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
