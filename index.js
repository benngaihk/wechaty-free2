import axios from 'axios';
import { ScanStatus, WechatyBuilder, log } from 'wechaty'
import qrcodeTerminal from 'qrcode-terminal'
import { spawn } from 'child_process';
import { FileBox } from "file-box";
import * as fs from 'fs';
import { IMAGE_PATH,OCR_PATH,PY_CMD } from './constants.js';

const bot = WechatyBuilder.build({
  name: 'chat-bot',
  puppetOptions: {
    uos: true  // 开启uos协议
  },
})

bot.start();

function onScan(qrcode, status) {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        const qrcodeImageUrl = [
            'https://wechaty.js.org/qrcode/',
            encodeURIComponent(qrcode),
        ].join('')
        log.info('StarterBot', 'onScan: %s(%s) - %s', ScanStatus[status], status, qrcodeImageUrl)

        qrcodeTerminal.generate(qrcode, { small: true })  // show qrcode on console

    } else {
        log.info('StarterBot', 'onScan: %s(%s)', ScanStatus[status], status)
    }
}
  
bot.on('scan', onScan)

async function onMessage(message) {
    
    log.info('StarterBot', message.toString())

    if(typeof message.room() != 'undefined')
    {
        let roomId = message.room().id;
        let roomTopic = await message.room().topic();
        let talkerId = message.talker().id;
        let talkerName = message.talker().name();

        if(message.type() == bot.Message.Type.Image)
        {
          try {
            const fileBox = await message.toFileBox();
            const fileName = IMAGE_PATH + fileBox.name;
            await fileBox.toFile(fileName, true);
    
            console.log(`saved, ${fileName}`);
    
            const pythonProcess = spawn(PY_CMD, [OCR_PATH, fileName]);
    
            pythonProcess.stdout.on('data', (data) => {
              if(data.indexOf("[") == 0){
                console.log("type",typeof(data.toString()));
                let ocrResult = data.toString().substring(1,data.lastIndexOf(']')-1);
                console.log("ocrResult:",ocrResult);
                let ocrResults = ocrResult.split(",");
                console.log("ocrResults:",ocrResults);
                let containsTime = containsTimeInfo(ocrResults);
                console.log("containsTime:",containsTime);
                if(containsTime) {
                  loadMessage(roomId, roomTopic, talkerId, talkerName, "图片打卡", bot.Message.Type.Text)
                    .then((data) => {
                      if(typeof data != 'undefined' && data != null)
                      {
                        if(data.type == "TXT")
                        {
                          message.room().say(data.content);
                        }
                        else if(data.type == "IMG")
                        {
                          const imageFilePath = data.content;
                          const fileBox = FileBox.fromFile(imageFilePath);
                          message.room().say(fileBox);
                        }
                      }
                    })
                    .catch((error) => {
                      log.info('error', error);
                    });
                }
              }
            });
    
            pythonProcess.stderr.on('data', (data) => {
              console.error(data.toString());
            });
    
            pythonProcess.on('close', (code) => {
              if (code === 0) {
                console.log('Python脚本执行成功！');
                fs.unlink(fileName, (err) => {
                  if (err) {
                    console.error('Error deleting file:', err);
                    return;
                  }
                  console.log('File deleted successfully');
                });

              } else {
                console.error(`Python脚本执行失败，退出码：${code}`);
              }
            });
    
    
          } catch(error) {
            console.error("error", error);
          }

        }
        else
        {
          loadMessage(roomId, roomTopic, message.talker().id, message.talker().name(), message.text(), message.type())
          .then((data) => {
            if(typeof data != 'undefined' && data != null)
            {
              if(data.type == "TXT")
              {
                message.room().say(data.content);
              }
              else if(data.type == "IMG")
              {
                const imageFilePath = data.content;
                const fileBox = FileBox.fromFile(imageFilePath);
                message.room().say(fileBox);
              }
            }
          })
          .catch((error) => {
            log.info('error', error);
          });
        }
    }
}
  
bot.on('message', onMessage)

async function loadMessage(groupId, groupName, userId, userName, message, messageType) {
    console.log("loadMessage");

    return axios.post('http://localhost:9091/checkin', {
        group_id: groupId,
        group_name: groupName,
        user_id: userId,
        user_name: userName,
        message: message,
        message_type: messageType,
    })
    .then((response) => {
        const { code, message, data } = response.data
        console.log('code:', code);
        console.log('message:', message);
        console.log('data:', data);
        return data;
    })
    .catch((error) => {
        log.info('error', error);
        throw error;
    });
}
  
  export function containsTimeInfo(strList) {
    // 定义时间信息的正则表达式
    // const timeRegex = /\d{1,2}[年月日时分]/;
    const timeRegex = /(\d+小时\d+分钟|\d+分钟|\d+:\d+(:\d+)?)/g;
  
    // 遍历字符串列表
    for (const str of strList) {
      // 使用正则表达式检查字符串是否包含时间信息
      if (timeRegex.test(str)) {
        return true;
      }
    }
  
    // 如果列表中没有包含时间信息的字符串，返回 false
    return false;
  } 