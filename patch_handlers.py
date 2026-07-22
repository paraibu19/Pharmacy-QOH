import re

with open('src/pages/AdminWorkload.tsx', 'r') as f:
    content = f.read()

old_code = """  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseAndProcessWorkload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(true);
  };

  const handleDragLeave = () => {
    setIsDraggingUpload(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      parseAndProcessWorkload(files);
    }
  };"""

new_code = """  const filterAlreadyUploadedFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const uploadedNames = new Set(uploadedFilesList.map(f => f.filename));
    const newFiles = fileArray.filter(f => !uploadedNames.has(f.name));
    
    if (newFiles.length < fileArray.length) {
      const skipped = fileArray.length - newFiles.length;
      setUploadError(`${skipped} file(s) were skipped because they have already been uploaded.`);
    }
    
    return newFiles;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = filterAlreadyUploadedFiles(files);
      if (newFiles.length > 0) {
        parseAndProcessWorkload(newFiles);
      }
    }
    // reset input so the same file can be selected again if it failed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(true);
  };

  const handleDragLeave = () => {
    setIsDraggingUpload(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newFiles = filterAlreadyUploadedFiles(files);
      if (newFiles.length > 0) {
        parseAndProcessWorkload(newFiles);
      }
    }
  };"""

content = content.replace(old_code, new_code)
with open('src/pages/AdminWorkload.tsx', 'w') as f:
    f.write(content)
