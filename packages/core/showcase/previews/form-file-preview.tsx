"use client";

import { useState } from "react";
import { FileField } from "../internal-ui";

export function FileFieldPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">默认单文件</span>
        <FileField label="选择文件" onChange={setFile} />
        {file && <span className="text-xs text-slate-500">已选：{file.name}</span>}
      </div>
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">多文件图片</span>
        <FileField accept="image/*" multiple buttonLabel="选择图片" resetOnChange onChange={() => {}} onFilesChange={(files) => setImageFiles(files ? Array.from(files) : [])} />
        {imageFiles.length > 0 && <ul className="text-xs text-slate-500">{imageFiles.map((f) => <li key={f.name}>· {f.name}</li>)}</ul>}
      </div>
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">内联纸面触发样式</span>
        <div className="text-sm text-slate-700">
          <FileField variant="inline" buttonLabel="原始数据、图谱、待包装品检验报告单见数据图谱粘贴页。" showFileName={false} resetOnChange onChange={() => {}} onFilesChange={(files) => setPaperFiles(files ? Array.from(files) : [])} />
        </div>
        {paperFiles.length > 0 && <ul className="text-xs text-slate-500">{paperFiles.map((f) => <li key={f.name}>· {f.name}</li>)}</ul>}
      </div>
    </div>
  );
}
