// 引入所需的 Node.js 核心模块
const { spawn } = require('child_process'); // 用于创建子进程
const fs = require('fs'); // 用于文件系统操作
const http = require('http'); // 用于 HTTP 请求
const https = require('https'); // 用于 HTTPS 请求

// 定义视频文件的 URL 和最大线程数
const videoUrl = 'https://videos.aiursoft.cn/media/original/user/anduin/5552db90ed7b494b9850f918e24ba872.mmexport1678851452849.mp4';
const maxThreads = 4; // 最大线程数
const tempDir = './temp'; // 临时文件夹路径

// 确保临时文件夹存在
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

/**
 * 获取视频文件的总大小
 * @param {string} url - 视频文件的 URL
 * @returns {Promise<number>} - 视频文件的总大小（字节）
 */
function getFileSize(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http; // 根据 URL 协议选择 HTTP 或 HTTPS 模块
    protocol.get(url, (res) => {
      if (res.statusCode === 200) {
        resolve(res.headers['content-length']); // 如果响应状态码为 200，获取内容长度
      } else {
        reject(new Error(`Failed to get file size: ${res.statusCode}`)); // 否则，拒绝 Promise
      }
    }).on('error', reject); // 监听错误事件
  });
}

/**
 * 创建下载器
 * @param {string} url - 视频文件的 URL
 * @param {number} maxThreads - 最大线程数
 */
function createDownloader(url, maxThreads) {
  let fileSize;
  let downloads = [];

  // 获取文件大小
  getFileSize(url)
    .then(size => {
      fileSize = parseInt(size, 10);
      console.log(`File size: ${fileSize} bytes`);

      // 计算每个线程下载的字节范围
      const chunkSize = Math.ceil(fileSize / maxThreads);
      for (let i = 0; i < maxThreads; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize - 1, fileSize - 1);
        const partUrl = `${url}&part=${i + 1}&total=${maxThreads}`;
        const outputPath = `${tempDir}/part_${i + 1}.mp4`;

        // 启动下载进程
        downloads.push(new Promise((resolve, reject) => {
          const curl = spawn('curl', ['-C', `-${start}`, '-o', outputPath, partUrl]);
          curl.on('error', reject);
          curl.on('close', (code) => {
            if (code === 0) {
              resolve(outputPath);
            } else {
              reject(new Error(`Download failed with exit code ${code}`));
            }
          });
        }));
      }

      return Promise.all(downloads); // 等待所有下载进程完成
    })
    .then(paths => {
      const outputPath = 'downloaded_video.mp4';
      const stream = fs.createWriteStream(outputPath);

      // 将所有下载的部分合并为一个文件
      paths.forEach((path, index) => {
        const readStream = fs.createReadStream(path);
        readStream.on('data', (chunk) => {
          stream.write(chunk, () => {
            console.log(`Written part ${index + 1}`);
          });
        });
        readStream.on('end', () => {
          console.log(`Finished part ${index + 1}`);
        });
        readStream.on('error', (err) => {
          console.error(`Error reading part ${index + 1}: ${err}`);
        });
      });

      stream.on('finish', () => {
        console.log('Download completed.');
        // 下载完成后删除临时文件
        paths.forEach(path => fs.unlinkSync(path));
      });

      stream.on('error', (err) => {
        console.error('Error writing to output file:', err);
      });
    })
    .catch(err => {
      console.error('Error:', err);
    });
}

// 启动下载器
createDownloader(videoUrl, maxThreads);