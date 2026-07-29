import { useParams } from "react-router-dom";

export default function PlaylistDetailPage() {
  const { playlistId } = useParams();

  return (
    <section>
      <h1>Playlist Details</h1>

      <p>Playlist ID: {playlistId}</p>
    </section>
  );
}