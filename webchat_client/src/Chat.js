// src/Chat.js (채팅방 기능이 추가된 최종 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import './Chat.css'; // 이전에 작성하신 CSS 파일 경로

// socket 객체는 컴포넌트 라이프사이클 외부에서 한 번만 생성
const socket = io('http://localhost:3001'); // Node.js 서버 주소

function Chat() {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageList, setMessageList] = useState([]);
  const [username] = useState(() => 'User-' + Math.floor(Math.random() * 100));
  const chatBodyRef = useRef(null);
  
  // [새로운 상태 1] 현재 접속 중인 방 ID
  const [currentRoom, setCurrentRoom] = useState(null); 
  
  // [새로운 상태 2] 임시 채팅방 목록
  const roomList = [
    { id: 'general', name: '📢 공지사항 및 잡담방' },
    { id: 'tech_qa', name: '💻 기술 Q&A' },
    { id: 'frontend', name: '⚛️ 프론트엔드 스터디' },
  ];

  // ----------------------------------------------------
  // 1. 방 입장 함수
  // ----------------------------------------------------
  const joinRoom = useCallback((roomId) => {
    if (currentRoom === roomId) return; // 이미 접속한 방이면 무시

    // 1. 서버로 join_room 이벤트 발신 (서버에서 이전 방 퇴장 처리)
    socket.emit('join_room', { roomId: roomId, username: username });
    
    // 2. 클라이언트 상태 업데이트 및 메시지 목록 초기화
    setCurrentRoom(roomId);
    setMessageList([]); 
  }, [currentRoom, username]);

  // ----------------------------------------------------
  // 2. Socket 이벤트 리스너 설정 (Mount 시)
  // ----------------------------------------------------
  useEffect(() => {
    // A. 메시지 수신 처리 (수신 메시지를 검사해서 시스템 메시지로 처리)
    socket.on('receive_message', (data) => {
      console.debug('receive_message', data);
      // 현재 방의 메시지만 처리
      if (data.roomId !== currentRoom) return;

      // 시스템 메시지 판단: 플래그가 있거나 author가 'system'이거나 메시지 텍스트 패턴
      const text = (data.message || '').toString();
      const isSystemByText = /님이 입장|님이 퇴장|님이 입장했습니다|님이 퇴장했습니다/.test(text);
      const authorLower = (data.author || '').toString().toLowerCase();
      const isSystem = data.isSystemMessage || authorLower === 'system' || isSystemByText;

      if (isSystem) {
        const sysMsg = {
          author: 'system',
          message: text,
          roomId: data.roomId,
          isSystemMessage: true,
          time: data.time || new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessageList((list) => [...list, sysMsg]);
      } else {
        // 정상 메시지
        setMessageList((list) => [...list, data]);
      }
    });

    // B. 방 입장 성공/알림 수신 처리
    socket.on('room_joined', (data) => {
        if (data.roomId === currentRoom) {
          setMessageList((list) => [...list, { author: 'system', message: data.message, roomId: data.roomId, isSystemMessage: true }]);
        }
    });

    // C. 사용자 입장 알림 수신
    socket.on('user_joined', (data) => {
        console.debug('user_joined', data);
        if (data.roomId === currentRoom) {
          const who = data.username || data.user || data.name || '누군가';
          setMessageList((list) => [...list, { author: 'system', message: `${who}님이 입장했습니다.`, roomId: data.roomId, isSystemMessage: true, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) }]);
        }
    });

    // D. 사용자 퇴장 알림 수신 (여러 필드 이름을 허용)
    const handleUserLeft = (data) => {
      console.debug('user_left (alias) received', data);
      // accept missing roomId: if not provided, assume currentRoom
      const roomId = data.roomId || currentRoom;
      if (!roomId || roomId !== currentRoom) return;
      const who = data.username || data.user || data.name || data.id || '누군가';
      const text = data.message || `${who}님이 퇴장했습니다.`;
      setMessageList((list) => [...list, { author: 'system', message: text, roomId: roomId, isSystemMessage: true, time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) }]);
    };

    // listen for multiple possible event names for leave
    socket.on('user_left', handleUserLeft);
    socket.on('user-left', handleUserLeft);
    socket.on('left', handleUserLeft);
    socket.on('leave', handleUserLeft);

    return () => {
      socket.off('receive_message');
      socket.off('room_joined');
      socket.off('user_joined');
      socket.off('user_left');
    };
  }, [currentRoom]); // currentRoom이 변경될 때마다 리스너를 다시 설정 (필요에 따라)

  // ----------------------------------------------------
  // 3. 자동 스크롤
  // ----------------------------------------------------
  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) {
      // 메시지 목록에 새 메시지가 추가되거나 방이 변경될 때만 스크롤
      const isNewMessage = messageList.length > 0 && messageList[messageList.length - 1].roomId === currentRoom;
      
      if (isNewMessage || messageList.length === 0) {
        try {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } catch (e) {
          el.scrollTop = el.scrollHeight;
        }
      }
    }
  }, [messageList, currentRoom]);

  // ----------------------------------------------------
  // 4. 메시지 전송 함수 (수정됨: roomId 포함)
  // ----------------------------------------------------
  const sendMessage = async () => {
    if (currentMessage.trim() === '' || !currentRoom) return;

    const messageData = {
      author: username,
      message: currentMessage,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      roomId: currentRoom, // [핵심 수정] 현재 방 ID 추가
    };

    // 1. 서버로 메시지 전송 (서버는 이 메시지를 해당 방에 중계)
    await socket.emit('send_message', messageData);
    
    // 2. 자신이 보낸 메시지는 서버를 거치지 않고 로컬 상태에 바로 추가 (지연 감소)
    setMessageList((list) => [...list, messageData]);

    setCurrentMessage(''); // 입력 필드 초기화
  };


  // ----------------------------------------------------
  // 5. 렌더링 (UI 분할)
  // ----------------------------------------------------
  return (
    <div className="chat-app-container full-layout"> {/* 새로운 클래스명 사용 */}
      
      {/* 1. 채팅방 목록 영역 (왼쪽 1/4) */}
      <div className="room-list-container">
        <h3>채팅방 목록</h3>
        {roomList.map((room) => (
          <div
            key={room.id}
            onClick={() => joinRoom(room.id)} 
            className={`room-item ${currentRoom === room.id ? 'active' : ''}`}
          >
            {room.name}
            {currentRoom === room.id && <span className="active-indicator"> (참여 중)</span>}
          </div>
        ))}
      </div>

      {/* 2. 채팅 창 영역 (오른쪽 3/4) */}
      <div className="chat-window-area">
        
        {/* 헤더 수정: 현재 방 정보 표시 */}
        <header className="chat-header">
          {currentRoom 
            ? <h2>{roomList.find(r => r.id === currentRoom)?.name}</h2>
            : <h2>채팅방을 선택해주세요.</h2>
          }
          <span className="user-id">현재 사용자: **{username}**</span>
        </header>
        
        <div className="chat-window">
          <div className="chat-body" ref={chatBodyRef}>
            {messageList.map((msg, index) => {
              // 시스템 메시지 렌더링 (isSystemMessage 플래그 또는 author가 'system'인 경우)
              const msgAuthorLower = (msg.author || '').toString().toLowerCase();
              if (msg.isSystemMessage || msgAuthorLower === 'system') {
                return (
                  <div key={index} className="system-message">
                    {msg.message}
                  </div>
                );
              }

              // 일반 메시지 렌더링
              const isMyMessage = msg.author === username;

              return (
                <div
                  key={index}
                  className={`message-container ${isMyMessage ? 'align-right' : 'align-left'}`}>

                  {/* Avatar - 상대는 왼쪽, 내 메시지는 오른쪽 */}
                  {!isMyMessage && (
                    <div className="avatar" title={msg.author}>
                      {msg.author ? msg.author.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}

                  <div className={`message-box ${isMyMessage ? 'my-message' : 'other-message'}`}>

                    {/* 상대방 메시지인 경우에만 사용자명 표시 (작게) */}
                    {!isMyMessage && (
                      <div className="message-author">
                        {msg.author}
                      </div>
                    )}

                    <div className="message-content">
                      <p>{msg.message}</p>
                    </div>

                    <div className="message-time">
                      {msg.time}
                    </div>
                  </div>

                  {isMyMessage && (
                    <div className="avatar me" title={username}>
                      {username ? username.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 메시지 입력 및 전송 영역 */}
          <div className="chat-footer">
            <input
              type="text"
              value={currentMessage}
              placeholder={currentRoom ? "메시지를 입력하세요..." : "채팅방을 먼저 선택하세요."}
              onChange={(event) => setCurrentMessage(event.target.value)}
              onKeyPress={(event) => {
                event.key === 'Enter' && sendMessage();
              }}
              disabled={!currentRoom} // 방이 선택되지 않으면 비활성화
            />
            <button onClick={sendMessage} disabled={!currentRoom}>전송</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;