async function extractTables(file) {

    const formData = new FormData();
  
    formData.append(
      'file',
      new Blob([file.buffer], {
        type: file.mimetype
      }),
      file.originalname
    );
  
    const response = await fetch(
      'http://localhost:5000/extract',
      {
        method: 'POST',
        body: formData
      }
    );
  
    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status}`
      );
    }
  
    return  response.json();
  }

  module.exports = extractTables;