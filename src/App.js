import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import { db, storage } from "./firebase";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

const ITEMS_PER_PAGE = 8;

function App() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tryAutoplay = async () => {
      try {
        audio.volume = 0.5;
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        setIsPlaying(false);
      }
    };

    tryAutoplay();
  }, []);

  useEffect(() => {
    loadMedia();
  }, []);

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
  };

  const loadMedia = async () => {
    try {
      const q = query(
        collection(db, "albums"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setMediaItems(items);
      setCurrentPage(1);
    } catch (error) {
      console.error("목록 불러오기 실패:", error);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      const fileType = file.type.startsWith("video") ? "video" : "image";
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `albums/${fileName}`);

      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "albums"), {
        url: downloadUrl,
        type: fileType,
        createdAt: serverTimestamp(),
        name: file.name,
      });

      await loadMedia();
      e.target.value = "";
    } catch (error) {
      console.error("업로드 실패:", error);
      alert("업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const totalPages = Math.ceil(mediaItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = mediaItems.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  return (
    <div className="App">
      <audio
        ref={audioRef}
        loop
        preload="auto"
        src={`${process.env.PUBLIC_URL}/memorial-music.mp3`}
      />

      <div className="mini-music-player">
        <span className="mini-music-title">봄내음보다 너를</span>

        <div className="mini-music-controls">
          <button className="mini-music-btn" onClick={handlePlay}>
            ▶
          </button>
          <button className="mini-music-btn" onClick={handlePause}>
            ❚❚
          </button>
        </div>
      </div>

      <div className="memorial-container">
        <section className="hero-section">
          <img
           className="hero-image"
           src={`${process.env.PUBLIC_URL}/loveStar.jpg`}
           alt="사랑하는 별이"
          />

          <div className="hero-text">
               <p className="hero-message">
              구별이 (2013.01.29~2026.03.26)
            </p>
            <h1 className="hero-title">소중한 별이를 기억하며</h1>
            <p className="hero-message">
              함께한 시간은 지나갔지만, 사랑은 여전히 우리 곁에 머물러 있어.
            </p>
            <p className="hero-subtext">
              별이와 함께한 따뜻한 순간들을 사진과 영상으로 간직하는 공간입니다.
            </p>
          </div>
        </section>

        <section className="album-section">
          <div className="album-header">
            <h2 className="album-title">추억 앨범</h2>

            <>
              <input
                type="file"
                accept="image/*,video/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <button
                className="upload-button"
                onClick={handleUploadClick}
                disabled={uploading}
              >
                {uploading ? "업로드 중..." : "사진 / 동영상 업로드"}
              </button>
            </>
          </div>

          {currentItems.length === 0 ? (
            <div className="empty-message">아직 업로드된 추억이 없습니다.</div>
          ) : (
            <>
              <div className="album-grid">
                {currentItems.map((item) => (
                  <div
                    key={item.id}
                    className="album-card"
                    onClick={() => setSelectedMedia(item)}
                  >
                    <div className="album-card-inner">
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt="추억 미디어"
                          className="album-media"
                        />
                      ) : (
                        <>
                          <video className="album-media" muted>
                            <source src={item.url} type="video/mp4" />
                          </video>
                          <div className="video-badge">동영상</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                    (page) => (
                      <button
                        key={page}
                        className={`page-button ${
                          currentPage === page ? "active" : ""
                        }`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {selectedMedia && (
        <div
          className="media-modal-overlay"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="media-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-button"
              onClick={() => setSelectedMedia(null)}
            >
              ×
            </button>

            {selectedMedia.type === "image" ? (
              <img
                src={selectedMedia.url}
                alt="확대 이미지"
                className="modal-media"
              />
            ) : (
              <video className="modal-media" controls autoPlay>
                <source src={selectedMedia.url} type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;