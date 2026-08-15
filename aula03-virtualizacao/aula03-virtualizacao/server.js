const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

// Configurar conexão com o PostgreSQL
const pool = new Pool({
  user: 'root',
  host: 'db',
  database: 'projeto',
  password: 'root',
  port: 5432,
});

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Rota raiz redireciona para cadastro
app.get('/', (req, res) => {
  res.redirect('/cadastro.html');
});

// Rotas API
app.post('/pessoas', async (req, res) => {
  const { nome, email, telefone } = req.body;
  try {
    await pool.query(
      'INSERT INTO pessoas (nome, email, telefone) VALUES ($1, $2, $3)',
      [nome, email, telefone]
    );
    res.redirect('/lista.html');
  } catch (err) {
    res.status(500).send('Erro ao cadastrar pessoa');
  }
});

app.get('/pessoas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pessoas');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Erro ao buscar pessoas');
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});