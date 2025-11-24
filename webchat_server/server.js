// server.js (채팅방 기능 추가 버전)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.io 서버 생성 및 설정 (CORS 허용)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", 
    methods: ["GET", "POST"]
  }
});

//test
// 클라이언트 연결 이벤트를 처리
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // =======================================================
  // [추가된 기능 1] 채팅방 입장 (join_room) 이벤트 처리
  // =======================================================
  socket.on('join_room', (data) => {
    const { roomId, username } = data;

    // 이전에 있던 방에서 퇴장 메시지 전송 (이름은 socket.data.username 또는 새로 들어온 username 사용)
    const prevUsername = socket.data.username || username;
    Array.from(socket.rooms).forEach((room) => {
      if (room !== socket.id && room !== roomId) {
        const leaveMsg = {
          author: "System",
          message: `${prevUsername} 님이 퇴장했습니다.`,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          roomId: room
        };
        socket.to(room).emit('receive_message', leaveMsg);
        socket.to(room).emit('user_left', { roomId: room, username: prevUsername });
        socket.leave(room);
      }
    });

    // 새 방 가입
    socket.join(roomId);

    // 소켓에 이름 저장
    socket.data.username = username;

    console.log(`User ${username} (${socket.id}) joined room: ${roomId}`);

    // 입장 시스템 메시지(다른 참가자에게)
    const systemMessage = {
      author: "System",
      message: `${username} 님이 입장했습니다.`,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      roomId: roomId
    };
    socket.to(roomId).emit('receive_message', systemMessage);
    socket.to(roomId).emit('user_joined', { roomId, username });

    // 입장 완료 응답(본인에게)
    socket.emit('room_joined', { roomId: roomId, message: `${roomId}에 성공적으로 입장했습니다.` });
  });

  
  // 메시지 전송(기존)
  socket.on('send_message', (data) => {
    const { roomId } = data;
    if (roomId) {
      console.log(`Message received from ${data.author} in room ${roomId}: ${data.message}`);
      socket.to(roomId).emit('receive_message', data);
    } else {
      console.warn('Received message without a room ID:', data);
    }
  });
  // 소켓 끊김 처리: 참여 중인 모든 방에 퇴장 메시지 전송
  socket.on('disconnect', () => {
    const username = socket.data.username || '누군가';
    Array.from(socket.rooms).forEach((room) => {
      if (room !== socket.id) {
        const leaveMsg = {
          author: "System",
          message: `${username} 님이 퇴장했습니다.`,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          roomId: room
        };
        // 다른 참가자에게 알림
        socket.to(room).emit('receive_message', leaveMsg);
        socket.to(room).emit('user_left', { roomId: room, username });
      }
    });
    console.log('User disconnected:', socket.id, username);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});