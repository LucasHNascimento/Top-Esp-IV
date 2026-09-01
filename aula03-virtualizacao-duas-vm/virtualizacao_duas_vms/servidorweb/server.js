const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

// Configurar conexao com o PostgreSQL.
//
// O campo host recebe o valor da variavel de ambiente DB_HOST, definida no
// arquivo docker-compose.yml desta maquina. Quando a variavel nao existe, o
// valor 'db' e utilizado, que e o nome do servico na composicao de uma unica
// maquina da pratica anterior.
//
// A diferenca entre nome e endereco e o assunto central desta pratica, e esta
// linha e o ponto exato em que ela aparece no codigo.
const pool = new Pool({
  user: 'root',
  host: process.env.DB_HOST || 'db',
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
    console.error('Erro ao cadastrar pessoa:', err.message);
    res.status(500).send('Erro ao cadastrar pessoa');
  }
});

app.get('/pessoas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pessoas');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar pessoas:', err.message);
    res.status(500).send('Erro ao buscar pessoas');
  }
});

// O servidor escuta em 0.0.0.0, ou seja, em qualquer interface de rede do
// container. Escutar apenas em 127.0.0.1 tornaria a aplicacao inalcancavel a
// partir de outra maquina, ainda que a rede estivesse correta.
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log(`Banco de dados configurado em: ${process.env.DB_HOST || 'db'}`);
});
