const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function conectarDB() {
  for (let intento = 1; intento <= 10; intento++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          usuario VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          inicios_sesion INTEGER DEFAULT 0,
          fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS inicios_sesion INTEGER DEFAULT 0;
      `);

      await pool.query(`
        INSERT INTO usuarios (usuario, password)
        VALUES ($1, $2)
        ON CONFLICT (usuario) DO NOTHING;
      `, ['admin', 'admin123']);

      console.log('Conectado a PostgreSQL');
      return;
    } catch (error) {
      console.error(`Intento ${intento}: error conectando a PostgreSQL`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error('No se pudo conectar a PostgreSQL');
}

conectarDB();

app.get('/', async (req, res) => {
  res.send('Backend funcionando correctamente.');
});

app.post('/login', async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({
      mensaje: 'Usuario y contraseña son obligatorios'
    });
  }

  try {
    const usuarioExistente = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = $1',
      [usuario]
    );

    if (usuarioExistente.rows.length === 0) {
      const nuevoUsuario = await pool.query(
        'INSERT INTO usuarios (usuario, password, inicios_sesion) VALUES ($1, $2, 1) RETURNING inicios_sesion',
        [usuario, password]
      );

      return res.json({
        usuario,
        iniciosSesion: nuevoUsuario.rows[0].inicios_sesion,
        mensaje: `Bienvenido, ${usuario}. Usuario guardado correctamente.`
      });
    }

    if (usuarioExistente.rows[0].password !== password) {
      return res.status(401).json({
        mensaje: 'Contraseña incorrecta'
      });
    }

    const loginActualizado = await pool.query(
      'UPDATE usuarios SET inicios_sesion = inicios_sesion + 1 WHERE usuario = $1 RETURNING inicios_sesion',
      [usuario]
    );

    res.json({
      usuario,
      iniciosSesion: loginActualizado.rows[0].inicios_sesion,
      mensaje: `Bienvenido de nuevo, ${usuario}.`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: 'Error al consultar la base de datos'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en puerto ${PORT}`);
});
